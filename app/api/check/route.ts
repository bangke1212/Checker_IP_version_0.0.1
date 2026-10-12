import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DNSBLS = [
  { name: "SpamCop", zone: "bl.spamcop.net" },
  { name: "DroneBL", zone: "dnsbl.dronebl.org" },
];

type ApproximateArea = {
  areaLabel: string | null;
  neighborhood: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  accuracyRadiusMeters: null;
  coordinateRounding: "0.01 degree";
  source: "OpenStreetMap Nominatim";
  attributionUrl: "https://www.openstreetmap.org/copyright";
};

const areaCache = new Map<string, { expiresAt: number; value: ApproximateArea }>();
const areaLookupsInFlight = new Map<string, Promise<ApproximateArea>>();
const AREA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_AREA_CACHE_ENTRIES = 500;
const MIN_NOMINATIM_INTERVAL_MS = 1_100;
let lastNominatimRequestAt = 0;

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return forwarded || real || "unknown";
}

function isPublicIpv4(ip: string) {
  const parts = ip.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function reverseIp(ip: string) {
  return ip.split(".").reverse().join(".");
}

async function lookupBlacklist(ip: string, zone: string) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return { name: zone, listed: false, status: "unavailable" as const };
  }

  try {
    const answers = await dns.resolve4(`${reverseIp(ip)}.${zone}`);
    return { name: zone, listed: answers.length > 0, status: "checked" as const };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { name: zone, listed: false, status: "checked" as const };
    }
    return { name: zone, listed: false, status: "unavailable" as const };
  }
}

function classifyIpType(connectionType?: string, provider = "") {
  const explicitType = connectionType?.trim().toLowerCase() || "";
  const providerText = provider.trim().toLowerCase();
  const sourceType = explicitType || providerText;

  if (/\b(cellular|mobile|wireless|lte|5g)\b/.test(sourceType)) {
    return { category: "Mobile" as const, confidence: explicitType ? "high" as const : "medium" as const };
  }
  if (/\b(residential|cable|dsl|broadband|fiber)\b/.test(sourceType)) {
    return { category: "Residential" as const, confidence: explicitType ? "high" as const : "medium" as const };
  }
  if (/\b(data\s*center|datacenter|hosting|cloud|vps)\b/.test(sourceType) ||
      /\b(amazon data services|aws|google cloud|microsoft azure|digitalocean|oracle cloud|linode|vultr|hetzner|ovhcloud)\b/.test(providerText)) {
    return { category: "Datacenter" as const, confidence: explicitType ? "high" as const : "medium" as const };
  }

  return { category: "Unknown" as const, confidence: "low" as const };
}

function firstAddressValue(address: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = address[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function lookupApproximateArea(latitude: number, longitude: number): Promise<ApproximateArea> {
  // Coarsen the IP-derived coordinates before sending them to the geocoder.
  const roundedLatitude = Number(latitude.toFixed(2));
  const roundedLongitude = Number(longitude.toFixed(2));
  const cacheKey = `${roundedLatitude},${roundedLongitude}`;
  const now = Date.now();
  const cached = areaCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) areaCache.delete(cacheKey);

  const activeLookup = areaLookupsInFlight.get(cacheKey);
  if (activeLookup) return activeLookup;
  if (now - lastNominatimRequestAt < MIN_NOMINATIM_INTERVAL_MS) {
    throw new Error("NOMINATIM_RATE_LIMIT");
  }
  lastNominatimRequestAt = now;

  const lookup = (async () => {
    const endpoint = process.env.NOMINATIM_REVERSE_URL?.trim() || "https://nominatim.openstreetmap.org/reverse";
    const url = new URL(endpoint);
    url.searchParams.set("lat", String(roundedLatitude));
    url.searchParams.set("lon", String(roundedLongitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "14");
    url.searchParams.set("layer", "address");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://checker-ip-version-0-0-1.vercel.app";
    const response = await fetch(url, {
      cache: "force-cache",
      next: { revalidate: 86_400 },
      headers: {
        "User-Agent": `IP-Sentinel/0.0.1 (+${siteUrl}/)`,
        Referer: `${siteUrl}/`,
        "Accept-Language": "id,en",
      },
      signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) throw new Error("NOMINATIM_UNAVAILABLE");

    const payload = await response.json() as { address?: Record<string, unknown> };
    const address = payload.address || {};
    const neighborhood = firstAddressValue(address, ["neighbourhood", "suburb", "city_district", "quarter", "borough"]);
    const locality = firstAddressValue(address, ["city", "town", "village", "municipality", "county"]);
    const region = firstAddressValue(address, ["state", "region", "state_district"]);
    const country = firstAddressValue(address, ["country"]);
    const areaLabel = [...new Set([neighborhood, locality, region, country].filter((part): part is string => Boolean(part)))].join(", ") || null;

    return {
      areaLabel,
      neighborhood,
      locality,
      region,
      country,
      accuracyRadiusMeters: null,
      coordinateRounding: "0.01 degree" as const,
      source: "OpenStreetMap Nominatim" as const,
      attributionUrl: "https://www.openstreetmap.org/copyright" as const,
    };
  })();

  areaLookupsInFlight.set(cacheKey, lookup);
  try {
    const value = await lookup;
    if (areaCache.size >= MAX_AREA_CACHE_ENTRIES) {
      const oldestKey = areaCache.keys().next().value;
      if (oldestKey) areaCache.delete(oldestKey);
    }
    areaCache.set(cacheKey, { expiresAt: Date.now() + AREA_CACHE_TTL_MS, value });
    return value;
  } finally {
    areaLookupsInFlight.delete(cacheKey);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const requestHost = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const requestProtocol = forwardedProto || request.nextUrl.protocol.replace(":", "");
  let sameOrigin = false;
  try {
    const originUrl = new URL(origin || "");
    sameOrigin = originUrl.host.toLowerCase() === requestHost.toLowerCase() && originUrl.protocol === `${requestProtocol}:`;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) {
    return NextResponse.json({ error: "Area lookup must be requested from this dashboard." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const latitude = typeof body === "object" && body !== null && "latitude" in body ? body.latitude : undefined;
  const longitude = typeof body === "object" && body !== null && "longitude" in body ? body.longitude : undefined;
  if (typeof latitude !== "number" || typeof longitude !== "number" ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
  }

  try {
    const area = await lookupApproximateArea(latitude, longitude);
    return NextResponse.json({ area, lookup: "user-triggered" });
  } catch (error) {
    if (error instanceof Error && error.message === "NOMINATIM_RATE_LIMIT") {
      return NextResponse.json(
        { error: "Please wait a moment before requesting another area lookup." },
        { status: 429, headers: { "Retry-After": "2" } },
      );
    }
    return NextResponse.json(
      { error: "Area lookup is temporarily unavailable. Please try again later." },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  const requestedIp = request.nextUrl.searchParams.get("ip")?.trim();
  const clientIp = requestedIp || getClientIp(request);

  if (clientIp === "unknown" || !isPublicIpv4(clientIp)) {
    return NextResponse.json(
      {
        error: requestedIp
          ? "Masukkan IPv4 publik yang valid, contoh 203.0.113.10. Jangan masukkan user/password proxy."
          : "IPv4 client tidak terdeteksi. Vercel atau jaringan Anda mungkin hanya meneruskan IPv6/proxy.",
      },
      { status: 400 },
    );
  }

  const [geoResponse, reverseDns, blacklists] = await Promise.all([
    fetch(`https://ipwho.is/${encodeURIComponent(clientIp)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }).then((response) => response.json()).catch(() => null),
    dns.reverse(clientIp).then((items) => items[0] || null).catch(() => null),
    Promise.all(DNSBLS.map((entry) => lookupBlacklist(clientIp, entry.zone))),
  ]);

  const connection = geoResponse?.success === false ? null : geoResponse?.connection;
  const ipType = classifyIpType(connection?.type, `${connection?.org || ""} ${connection?.isp || ""}`);
  const listed = blacklists.filter((item) => item.status === "checked" && item.listed).length;
  const score = Math.max(0, 100 - listed * 35);
  const threatScore = 100 - score;

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    clientIp,
    reverseDns,
    geo: geoResponse?.success === false ? null : geoResponse,
    blacklists,
    ipType,
    score,
    threatScore,
    status: listed > 0 ? "review" : "healthy",
    source: requestedIp ? "manual" : "client",
    caveat:
      "Hasil ini berdasarkan reputasi publik IP dan tidak menjamin kelayakan pada layanan pihak ketiga.",
  });
}
