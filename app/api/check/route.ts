import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGETS = [
  { name: "DAWN website", url: "https://dawninternet.com/" },
  { name: "DAWN dashboard", url: "https://dashboard.dawninternet.com/" },
];

const DNSBLS = [
  { name: "SpamCop", zone: "bl.spamcop.net" },
  { name: "DroneBL", zone: "dnsbl.dronebl.org" },
];

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return forwarded || real || "unknown";
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

async function timedFetch(url: string) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "IP-Sentinel/0.0.1" },
    });
    return {
      name: url,
      ok: response.ok || response.status < 500,
      status: response.status,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch {
    return {
      name: url,
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request);

  if (clientIp === "unknown" || clientIp.includes(":")) {
    return NextResponse.json(
      {
        error:
          "IPv4 client tidak terdeteksi. Vercel atau jaringan Anda mungkin hanya meneruskan IPv6/proxy.",
      },
      { status: 400 },
    );
  }

  const [geoResponse, reverseDns, blacklists, endpointChecks] = await Promise.all([
    fetch(`https://ipwho.is/${encodeURIComponent(clientIp)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }).then((response) => response.json()).catch(() => null),
    dns.reverse(clientIp).then((items) => items[0] || null).catch(() => null),
    Promise.all(DNSBLS.map((entry) => lookupBlacklist(clientIp, entry.zone))),
    Promise.all(TARGETS.map((target) => timedFetch(target.url))),
  ]);

  const listed = blacklists.filter((item) => item.status === "checked" && item.listed).length;
  const failedEndpoints = endpointChecks.filter((item) => !item.ok).length;
  const score = Math.max(0, 100 - listed * 35 - failedEndpoints * 15);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    clientIp,
    reverseDns,
    geo: geoResponse?.success === false ? null : geoResponse,
    blacklists,
    endpointChecks,
    score,
    status: listed > 0 ? "review" : failedEndpoints > 0 ? "degraded" : "healthy",
    caveat:
      "Hasil ini memeriksa reputasi publik dan konektivitas dari sisi layanan. Ini bukan pemeriksaan internal DAWN dan tidak menjamin kelayakan reward.",
  });
}
