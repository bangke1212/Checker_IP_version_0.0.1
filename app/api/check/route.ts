import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DNSBLS = [
  { name: "SpamCop", zone: "bl.spamcop.net" },
  { name: "DroneBL", zone: "dnsbl.dronebl.org" },
];

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

  const listed = blacklists.filter((item) => item.status === "checked" && item.listed).length;
  const score = Math.max(0, 100 - listed * 35);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    clientIp,
    reverseDns,
    geo: geoResponse?.success === false ? null : geoResponse,
    blacklists,
    score,
    status: listed > 0 ? "review" : "healthy",
    source: requestedIp ? "manual" : "client",
    caveat:
      "Hasil ini berdasarkan reputasi publik IP dan tidak menjamin kelayakan pada layanan pihak ketiga.",
  });
}
