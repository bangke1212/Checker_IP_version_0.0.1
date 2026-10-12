export type ConnectionInfo = {
  isp?: string;
  org?: string;
  asn?: number;
  type?: string;
};

export type GeoInfo = {
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
  timezone?: { id?: string; utc?: string };
  connection?: ConnectionInfo;
} | null;

export type CheckResult = {
  checkedAt: string;
  clientIp: string;
  reverseDns: string | null;
  geo: GeoInfo;
  blacklists: { name: string; listed: boolean; status: string }[];
  ipType: { category: "Residential" | "Mobile" | "Datacenter" | "Unknown"; confidence: "high" | "medium" | "low" };
  score: number;
  threatScore: number;
  status: "healthy" | "review";
  source?: "client" | "manual";
  caveat: string;
};

export type SpeedResult = { mbps: number; latencyMs: number; bytes: number };
