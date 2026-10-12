"use client";

import { useState } from "react";
import type { FormEventHandler, ReactNode } from "react";
import type { CheckResult, SpeedResult } from "./types";

type SectionProps = { result: CheckResult | null };
type ApproximateArea = {
  areaLabel: string | null;
  neighborhood: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  accuracyRadiusMeters: null;
  coordinateRounding: string;
  source: string;
  attributionUrl: string;
};
type AreaLookupState = { key: string; loading: boolean; area: ApproximateArea | null; error: string };

export function IntelligenceSection({ result }: SectionProps) {
  const [areaLookupState, setAreaLookupState] = useState<AreaLookupState | null>(null);
  const latitude = result?.geo?.latitude;
  const longitude = result?.geo?.longitude;
  const areaLookupKey = result && typeof latitude === "number" && typeof longitude === "number"
    ? `${result.clientIp}:${latitude}:${longitude}`
    : "";
  const currentAreaLookup = areaLookupState?.key === areaLookupKey ? areaLookupState : null;

  const lookupNearestArea = async () => {
    if (!areaLookupKey || typeof latitude !== "number" || typeof longitude !== "number") return;
    const key = areaLookupKey;
    setAreaLookupState({ key, loading: true, area: null, error: "" });
    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude }),
      });
      const payload = await response.json() as { area?: ApproximateArea; error?: string };
      if (!response.ok || !payload.area) throw new Error(payload.error || "Area lookup is unavailable.");
      setAreaLookupState({ key, loading: false, area: payload.area, error: "" });
    } catch (error) {
      setAreaLookupState({
        key,
        loading: false,
        area: null,
        error: error instanceof Error ? error.message : "Area lookup is unavailable.",
      });
    }
  };

  if (!result) {
    return <SectionFrame eyebrow="IP INTELLIGENCE" title="Detailed IP analysis" description="Inspect the network, location and reputation signals for the IP currently selected in the dashboard.">
      <EmptyState title="Waiting for an IP result" description="The dashboard is checking the current network IP. You can also enter an IPv4 address in the search bar above." />
    </SectionFrame>;
  }

  const location = [result.geo?.city, result.geo?.region, result.geo?.country].filter(Boolean).join(", ") || "Location unavailable";
  const checkedCount = result.blacklists.filter((source) => source.status === "checked").length;
  const listedCount = result.blacklists.filter((source) => source.status === "checked" && source.listed).length;

  return <SectionFrame eyebrow="IP INTELLIGENCE" title="Detailed IP analysis" description="A deeper look at the currently selected IP, with provider confidence and source-level reputation results.">
    <div className="section-metrics">
      <MetricCard label="PUBLIC IP" value={result.clientIp} detail={result.source === "manual" ? "Manual lookup" : "Current network"} />
      <MetricCard label="NETWORK TYPE" value={result.ipType.category} detail={`${capitalize(result.ipType.confidence)} confidence`} />
      <MetricCard label="HEALTH SCORE" value={`${result.score} / 100`} detail={result.status === "review" ? "Review public signals" : "No listed signal detected"} />
      <MetricCard label="AUTONOMOUS SYSTEM" value={result.geo?.connection?.asn ? `AS${result.geo.connection.asn}` : "Unavailable"} detail={result.geo?.connection?.org || "Organization unavailable"} />
    </div>

    <div className="section-card-grid">
      <article className="section-card">
        <CardHeading eyebrow="NETWORK & LOCATION" title="Where this IP appears" />
        <DataRow label="Location" value={location} />
        <DataRow label="Coordinates" value={formatCoordinates(result.geo?.latitude, result.geo?.longitude)} />
        <DataRow label="Time zone" value={result.geo?.timezone?.id || "Unavailable"} />
        <DataRow label="Organization" value={result.geo?.connection?.org || "Unavailable"} />
        <DataRow label="Network / ISP" value={result.geo?.connection?.isp || "Unavailable"} />
        <DataRow label="IP category" value={`${result.ipType.category} · ${result.ipType.confidence} confidence`} />
        <div className="location-accuracy" role="note">
          <strong>IP-based estimate · not GPS</strong>
          <span>This may identify an ISP or nearby area, not a customer’s home or street. The GeoIP source provides no accuracy radius.</span>
        </div>
        <div className="area-lookup">
          <button className="button-secondary" type="button" onClick={lookupNearestArea} disabled={!areaLookupKey || Boolean(currentAreaLookup?.loading)}>
            {currentAreaLookup?.loading ? "Looking up nearby area…" : currentAreaLookup?.area ? "Area lookup complete" : "Look up nearest mapped area"}
          </button>
          {currentAreaLookup?.error && <p className="area-lookup-error" role="alert">{currentAreaLookup.error}</p>}
          {currentAreaLookup?.area && <div className="area-result" aria-live="polite">
            <span className="data-label">NEAREST MAPPED AREA · APPROXIMATE</span>
            <strong>{currentAreaLookup.area.areaLabel || "No nearby area label available"}</strong>
            <p>Coordinates were rounded to 0.01° before lookup. No street, house number, or accuracy radius is provided.</p>
            <a href={currentAreaLookup.area.attributionUrl} target="_blank" rel="noreferrer">Data © OpenStreetMap contributors</a>
          </div>}
        </div>
      </article>

      <article className="section-card">
        <CardHeading eyebrow="PUBLIC REPUTATION" title="DNS blocklist checks" />
        <DataRow label="Overall" value={listedCount > 0 ? `${listedCount} listed` : checkedCount === result.blacklists.length && checkedCount > 0 ? "No listings found" : "Partial results"} />
        <DataRow label="Sources checked" value={`${checkedCount} / ${result.blacklists.length}`} />
        {result.blacklists.map((source) => <div className="source-row" key={source.name}>
          <span>{displaySourceName(source.name)}</span>
          <span className={`source-result ${source.status === "checked" && source.listed ? "is-listed" : source.status === "checked" ? "is-clean" : "is-unknown"}`}>
            {source.status !== "checked" ? "Unavailable" : source.listed ? "Listed" : "Clean"}
          </span>
        </div>)}
      </article>

      <article className="section-card">
        <CardHeading eyebrow="REVERSE DNS" title="PTR record" />
        <p className="section-copy">Reverse DNS maps an IP address to a hostname when a PTR record is published.</p>
        <div className="monospace-value">{result.reverseDns || "No PTR record returned"}</div>
      </article>

      <article className="section-card">
        <CardHeading eyebrow="ASSESSMENT NOTES" title="How to read this result" />
        <p className="section-copy">The type category is an estimate based on provider metadata. A low-confidence <strong>Unknown</strong> means the available signals were not enough to classify the connection reliably.</p>
        <p className="section-copy">A clean DNSBL result only describes the public sources that responded during this check; it does not guarantee acceptance by another service.</p>
      </article>
    </div>

    <p className="section-footnote">Checked at {formatUtc(result.checkedAt)} · Results are based on public network data.</p>
  </SectionFrame>;
}

export function ToolsSection({
  result,
  speed,
  speedLoading,
  searchIp,
  onSearchChange,
  onSearchSubmit,
  onResetSearch,
  onRunSpeedTest,
}: SectionProps & {
  speed: SpeedResult | null;
  speedLoading: boolean;
  searchIp: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: FormEventHandler<HTMLFormElement>;
  onResetSearch: () => void;
  onRunSpeedTest: () => void;
}) {
  return <SectionFrame eyebrow="TOOLS" title="Run a focused check" description="Use the existing IP lookup and browser speed test. These tools do not route traffic through a proxy or need proxy credentials.">
    <div className="section-card-grid tools-grid">
      <article className="section-card tool-card">
        <CardHeading eyebrow="IP LOOKUP" title="Inspect an IPv4 address" />
        <p className="section-copy">Check public metadata, reverse DNS and the configured DNSBL sources for one IPv4 address.</p>
        <form className="tool-form" onSubmit={onSearchSubmit}>
          <label htmlFor="tools-ip-input">IPv4 address</label>
          <div className="tool-input-row">
            <input id="tools-ip-input" inputMode="decimal" placeholder="203.0.113.10" value={searchIp} onChange={(event) => onSearchChange(event.target.value)} />
            <button className="button-primary" type="submit">Scan IP</button>
          </div>
        </form>
        <div className="tool-current"><span>Currently selected</span><strong>{result?.clientIp || "Waiting for first scan"}</strong></div>
        {result?.source === "manual" && <button className="button-secondary" type="button" onClick={onResetSearch}>Return to current network IP</button>}
        <p className="section-footnote">Enter an IPv4 address only. Do not enter proxy usernames, passwords or other credentials.</p>
      </article>

      <article className="section-card tool-card">
        <CardHeading eyebrow="BROWSER SPEED" title="Test this browser connection" />
        <p className="section-copy">Downloads a small test file in this browser and estimates transfer speed. It is a point-in-time browser result, not a server-wide measurement.</p>
        <div className="tool-speed-value">{speed ? <><strong>{speed.mbps}</strong><span>Mbps</span></> : <><strong>—</strong><span>Mbps</span></>}</div>
        {speed && <div className="tool-current"><span>Measured request time</span><strong>{speed.latencyMs} ms</strong></div>}
        <button className="button-primary" type="button" onClick={onRunSpeedTest} disabled={speedLoading}>{speedLoading ? "Testing connection…" : "Run speed test"}</button>
        <p className="section-footnote">A test file is requested from Cloudflare only after you start the test.</p>
      </article>
    </div>
  </SectionFrame>;
}

export function ReportsSection({ result, onDownload, onPrint }: SectionProps & { onDownload: () => void; onPrint: () => void }) {
  const checkedCount = result?.blacklists.filter((source) => source.status === "checked").length ?? 0;
  const listedCount = result?.blacklists.filter((source) => source.status === "checked" && source.listed).length ?? 0;

  return <SectionFrame eyebrow="REPORTS" title="Current scan report" description="Review or export the latest scan. This demo does not keep a historical report archive.">
    {!result ? <EmptyState title="No scan report yet" description="A report appears here after an IP check completes. Use the search bar or the IP Lookup tool to run one." /> : <article className="section-card report-sheet">
      <div className="report-header">
        <div><span className="report-kicker">IP / SENTINEL · NETWORK REPORT</span><h3>{result.clientIp}</h3></div>
        <span className={`report-status ${result.status === "review" ? "is-listed" : "is-clean"}`}>{result.status === "review" ? "REVIEW" : "HEALTHY"}</span>
      </div>
      <div className="section-metrics report-metrics">
        <MetricCard label="HEALTH SCORE" value={`${result.score} / 100`} detail="Public signals only" />
        <MetricCard label="IP TYPE" value={result.ipType.category} detail={`${capitalize(result.ipType.confidence)} confidence`} />
        <MetricCard label="LOCATION" value={result.geo?.country || "Unavailable"} detail={result.geo?.country_code || "No country code"} />
        <MetricCard label="DNSBL" value={listedCount > 0 ? `${listedCount} listed` : "No listings"} detail={`${checkedCount}/${result.blacklists.length} sources checked`} />
      </div>
      <div className="report-details">
        <DataRow label="Organization" value={result.geo?.connection?.org || "Unavailable"} />
        <DataRow label="ASN" value={result.geo?.connection?.asn ? `AS${result.geo.connection.asn}` : "Unavailable"} />
        <DataRow label="Network / ISP" value={result.geo?.connection?.isp || "Unavailable"} />
        <DataRow label="Reverse DNS" value={result.reverseDns || "No PTR record returned"} />
        <DataRow label="Checked at (UTC)" value={formatUtc(result.checkedAt)} />
        <DataRow label="Lookup source" value={result.source === "manual" ? "Manual IPv4 lookup" : "Current network IP"} />
      </div>
      <div className="report-sources">
        <span className="data-label">SOURCE-LEVEL RESULTS</span>
        {result.blacklists.map((source) => <div className="source-row" key={source.name}>
          <span>{displaySourceName(source.name)}</span>
          <span className={`source-result ${source.status === "checked" && source.listed ? "is-listed" : source.status === "checked" ? "is-clean" : "is-unknown"}`}>
            {source.status !== "checked" ? "Unavailable" : source.listed ? "Listed" : "Clean"}
          </span>
        </div>)}
      </div>
      <p className="report-disclaimer">{result.caveat} This report summarizes only the current check and is not saved by the application.</p>
      <div className="report-actions">
        <button className="button-secondary" type="button" onClick={onDownload}>Download JSON</button>
        <button className="button-primary" type="button" onClick={onPrint}>Print / Save as PDF</button>
      </div>
    </article>}
  </SectionFrame>;
}

export function PrivacySection() {
  return <SectionFrame eyebrow="PRIVACY" title="What happens to your scan" description="A plain-language summary of what this demo checks, which services receive a lookup, and what the application does not store.">
    <div className="privacy-intro"><strong>IP checks require processing the address being checked.</strong><span>The dashboard does not promise that a scan is anonymous: network providers and the hosting platform may process request data under their own policies.</span></div>
    <div className="section-card-grid privacy-grid">
      <article className="section-card"><CardHeading eyebrow="01 · INPUT" title="Which IP is checked?" /><p className="section-copy">By default, the server checks the IPv4 address forwarded for the current request. If you enter an IPv4 address manually, that address becomes the lookup target. The manual check does not send your traffic through a proxy. The GeoIP source does not provide an accuracy radius, so these coordinates are not GPS and cannot verify a customer’s home or street.</p></article>
      <article className="section-card"><CardHeading eyebrow="02 · LOOKUPS" title="Who receives lookup data?" /><ul className="privacy-list"><li><strong>IPWho.is</strong> receives the target IP for location and network-provider metadata.</li><li><strong>DNS services</strong> are queried for the target IP’s PTR record and SpamCop / DroneBL reputation zones.</li><li><strong><a href="https://nominatim.openstreetmap.org/" target="_blank" rel="noreferrer">OpenStreetMap Nominatim</a></strong> receives coordinates rounded to 0.01° only when you choose “Look up nearest mapped area”. This request is not part of automatic polling. Review the <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer">usage policy</a>.</li><li><strong>Cloudflare</strong> receives a small download request only when you explicitly run the browser speed test.</li></ul><p className="section-copy">The public Nominatim service has a strict usage policy. This app caches results and limits lookups; high-volume use needs a separately hosted or quota-based provider.</p></article>
      <article className="section-card"><CardHeading eyebrow="03 · STORAGE" title="Is scan history saved?" /><p className="section-copy">The application does not write IP addresses or reports to an app database and does not maintain a report history. The approximate area lookup response is cached for up to 24 hours using rounded coordinates to reduce repeat requests.</p><p className="section-copy">The hosting platform and external providers may keep operational logs under their own retention policies. The app cannot control those policies.</p></article>
      <article className="section-card"><CardHeading eyebrow="04 · CONTROL" title="What can you choose?" /><ul className="privacy-list"><li>Use the automatic current-IP check or enter an IPv4 address for a manual lookup.</li><li>Run the browser speed test only when you choose to.</li><li>Do not enter proxy credentials, passwords, tokens or other secrets; this tool does not need them.</li></ul></article>
    </div>
    <p className="section-footnote">The dashboard refreshes the selected IP check periodically while the page is open. Public reputation data can be incomplete, delayed or inaccurate.</p>
  </SectionFrame>;
}

function SectionFrame({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <section className="page-content" aria-label={title}>
    <header className="section-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></header>
    {children}
  </section>;
}

function CardHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="section-card-heading"><span className="data-label">{eyebrow}</span><h3>{title}</h3></div>;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="metric-card"><span className="data-label">{label}</span><strong title={value}>{value}</strong><span title={detail}>{detail}</span></article>;
}

function DataRow({ label, value }: { label: string; value: string }) {
  return <div className="detail-row"><span>{label}</span><strong title={value}>{value}</strong></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="section-card empty-state"><span className="empty-mark">—</span><h3>{title}</h3><p>{description}</p></div>;
}

function formatCoordinates(latitude?: number, longitude?: number) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return "Unavailable";
  return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
}

function formatUtc(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unavailable" : parsed.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function displaySourceName(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("spamcop")) return "SpamCop";
  if (normalized.includes("dronebl")) return "DroneBL";
  return name;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
