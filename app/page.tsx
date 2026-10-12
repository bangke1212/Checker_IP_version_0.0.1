"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import NetworkGlobe from "./network-globe";
import { IntelligenceSection, PrivacySection, ReportsSection, ToolsSection } from "./dashboard-sections";
import type { CheckResult, SpeedResult } from "./types";

type SectionId = "overview" | "ip-intelligence" | "tools" | "reports" | "privacy";
const sections: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "ip-intelligence", label: "IP Intelligence" },
  { id: "tools", label: "Tools" },
  { id: "reports", label: "Reports" },
  { id: "privacy", label: "Privacy" },
];

export default function Home() {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [speed, setSpeed] = useState<SpeedResult | null>(null);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const [speedLoading, setSpeedLoading] = useState(false);
  const [searchIp, setSearchIp] = useState("");
  const [targetIp, setTargetIp] = useState("");

  useEffect(() => {
    const syncSectionFromUrl = () => {
      const requested = window.location.hash.slice(1);
      setActiveSection(sections.find((section) => section.id === requested)?.id || "overview");
    };
    syncSectionFromUrl();
    window.addEventListener("popstate", syncSectionFromUrl);
    window.addEventListener("hashchange", syncSectionFromUrl);
    return () => {
      window.removeEventListener("popstate", syncSectionFromUrl);
      window.removeEventListener("hashchange", syncSectionFromUrl);
    };
  }, []);

  const checkIp = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = targetIp ? `&ip=${encodeURIComponent(targetIp)}` : "";
      const response = await fetch(`/api/check?ts=${Date.now()}${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "IP check failed");
      setResult(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete IP check");
    } finally {
      setLoading(false);
    }
  }, [targetIp]);

  useEffect(() => {
    checkIp();
    const timer = window.setInterval(checkIp, 30_000);
    return () => window.clearInterval(timer);
  }, [checkIp]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTargetIp(searchIp.trim());
  };

  const resetSearch = () => {
    setSearchIp("");
    setTargetIp("");
  };

  const navigateToSection = (section: SectionId) => {
    if (section === activeSection) return;
    setActiveSection(section);
    window.history.pushState({ section }, "", `#${section}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const runSpeedTest = async () => {
    setSpeedLoading(true);
    setSpeed(null);
    setError("");
    const bytes = 1_000_000;
    const started = performance.now();
    try {
      const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}&ts=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Speed endpoint unavailable");
      await response.arrayBuffer();
      const seconds = Math.max((performance.now() - started) / 1000, 0.01);
      const mbps = Number(((bytes * 8) / seconds / 1_000_000).toFixed(2));
      const sample = {
        mbps,
        latencyMs: Math.round(performance.now() - started),
        bytes,
      };
      setSpeed(sample);
      setSpeedHistory((history) => [...history, mbps].slice(-12));
    } catch {
      setError("Speed test failed in this browser. Try again or check the network.");
    } finally {
      setSpeedLoading(false);
    }
  };

  const downloadReport = () => {
    if (!result) return;
    const report = {
      product: "IP/Sentinel",
      exportedAt: new Date().toISOString(),
      ...result,
    };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `ip-sentinel-${result.clientIp}-${Date.now()}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  const location = useMemo(() => {
    if (!result?.geo) return "Location unavailable";
    return [result.geo.city, result.geo.region, result.geo.country].filter(Boolean).join(", ");
  }, [result]);

  const score = result?.score ?? 0;
  const flaggedCount = result?.blacklists.filter((item) => item.status === "checked" && item.listed).length ?? 0;
  const checkedBlacklistCount = result?.blacklists.filter((item) => item.status === "checked").length ?? 0;
  const reputationLabel = !result ? "Pending" : flaggedCount > 0 ? "Review" : checkedBlacklistCount === result.blacklists.length && checkedBlacklistCount > 0 ? "Clean" : "Partial";
  const countryFlag = result?.geo?.country_code ? flagEmoji(result.geo.country_code) : "";
  const organization = result?.geo?.connection?.org || result?.geo?.connection?.isp || "Organization unavailable";
  const asn = result?.geo?.connection?.asn;
  const connectionType = result?.ipType
    ? `${result.ipType.category} · ${result.ipType.confidence} confidence`
    : "Type unavailable";
  const speedPath = buildSparkline(speedHistory);

  return (
    <main className="app-shell" id="overview">
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="IP Sentinel home" onClick={(event) => { event.preventDefault(); navigateToSection("overview"); }}>
          <span className="brand-gem" aria-hidden="true"><span /></span>
          <span>IP<span className="brand-slash">/</span>SENTINEL</span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          {sections.map((section) => <button
            className={`nav-link ${activeSection === section.id ? "active" : ""}`}
            key={section.id}
            type="button"
            aria-current={activeSection === section.id ? "page" : undefined}
            onClick={() => navigateToSection(section.id)}
          >{section.label}</button>)}
        </nav>

        <div className="topbar-right">
          <form className="search-form" onSubmit={submitSearch}>
            <SearchIcon />
            <input
              aria-label="Search public IP address"
              inputMode="decimal"
              placeholder="Search public IP address"
              value={searchIp}
              onChange={(event) => setSearchIp(event.target.value)}
            />
            {targetIp && <button className="clear-search" type="button" onClick={resetSearch} aria-label="Return to my IP">×</button>}
            <button className="search-submit" type="submit">Scan</button>
          </form>
          <span className={`live-indicator ${loading ? "is-loading" : ""}`} title={loading ? "Checking IP" : "Live IP check"} />
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">GLOBAL IP INTELLIGENCE</p>
          <h1 id="hero-title">Network intelligence</h1>
          <p>Actionable IP insight for a safer, more informed internet.</p>
        </div>
        <div className="hero-globe-wrap" aria-hidden="true">
          <NetworkGlobe />
          <div className="hero-tagline">CLEARER<br />CONTEXT<br />SAFER<br />CONNECTIONS</div>
        </div>
      </section>

      {error && <div className="notice" role="alert">{error}</div>}

      {activeSection === "overview" && <>
      <section className="primary-grid" aria-label="IP health, geolocation and organization overview">
        <article className={`panel health-panel ${result?.status === "review" ? "is-review" : ""}`}>
          <PanelTitle icon={<ShieldIcon />} label="IP HEALTH" />
          <div className="health-content">
            <div className="score-ring-wrap">
              <svg className="score-ring" viewBox="0 0 180 180" role="img" aria-label={`Health score ${result ? score : "loading"} out of 100`}>
                <circle className="ring-track" cx="90" cy="90" r="76" />
                <circle className="ring-progress" cx="90" cy="90" r="76" style={{ strokeDasharray: `${(score / 100) * 477.5} 477.5` }} />
              </svg>
              <div className="ring-label">
                <strong>{result ? score : "—"}</strong>
                <span>/ 100</span>
                <b>{loading && !result ? "SCANNING" : result?.status === "review" ? "REVIEW" : result ? "HEALTHY" : "WAITING"}</b>
              </div>
            </div>
            <div className="health-summary">
              <span className="data-label">Public IP</span>
              <strong className="public-ip">{result?.clientIp || "Waiting for IP"}</strong>
              <span className="copy-note">{result?.source === "manual" ? "Manual IP lookup" : "Current network IP"}</span>
              <p>{result?.caveat || "Public reputation signals are being checked."}</p>
            </div>
          </div>
        </article>

        <article className="panel geo-panel">
          <PanelTitle icon={<PinIcon />} label="GEOLOCATION" menu />
          <div className="geo-main">
            <span className="country-flag">{countryFlag || <PinIcon />}</span>
            <div>
              <strong>{result?.geo?.country || "Location pending"}</strong>
              <span>{result?.geo?.country_code || "—"}</span>
            </div>
          </div>
          <div className="detail-rows">
            <DetailRow label="City / Region" value={location} />
            <DetailRow label="Coordinates" value={formatCoordinates(result?.geo?.latitude, result?.geo?.longitude)} />
            <DetailRow label="Time zone" value={result?.geo?.timezone?.id || "Unavailable"} />
          </div>
        </article>

        <article className="panel org-panel">
          <PanelTitle icon={<BuildingIcon />} label="ORGANIZATION" menu />
          <div className="org-brand">
            <span className="org-symbol" aria-hidden="true">{organization.charAt(0).toUpperCase()}</span>
            <strong>{organization}</strong>
          </div>
          <div className="detail-rows org-rows">
            <DetailRow label="ASN" value={asn ? `AS${asn}` : "Unavailable"} />
            <DetailRow label="Organization" value={result?.geo?.connection?.org || "Unavailable"} />
            <DetailRow label="Network" value={result?.geo?.connection?.isp || "Unavailable"} />
            <DetailRow label="Type" value={connectionType} />
          </div>
        </article>
      </section>

      <section className="signals-grid" aria-label="IP reputation and connection signals">
        <article className="panel reputation-overview">
          <PanelTitle icon={<ShieldIcon />} label="REPUTATION" menu />
          <span className="data-label">DNSBL</span>
          <strong className={`large-status ${flaggedCount > 0 ? "status-bad" : ""}`}>
            {reputationLabel}
          </strong>
          <span className="small-caption">{result ? `${flaggedCount} listed · ${checkedBlacklistCount}/${result.blacklists.length} checked` : "Waiting for first check"}</span>
        </article>

        {(result?.blacklists.length ? result.blacklists : [
          { name: "SpamCop", listed: false, status: "pending" },
          { name: "DroneBL", listed: false, status: "pending" },
        ]).slice(0, 2).map((item) => (
          <article className="panel signal-tile" key={item.name}>
            <PanelTitle icon={<SignalIcon />} label={formatBlacklistName(item.name).toUpperCase()} menu />
            <span className="data-label">{formatBlacklistName(item.name)}</span>
            <StatusPill listed={item.listed} status={item.status} />
            <span className="small-caption">{item.status === "pending" ? "Waiting for result" : item.listed ? "Listed by this source" : item.status === "unavailable" ? "Source unavailable" : `Not listed in ${formatBlacklistName(item.name)}`}</span>
          </article>
        ))}

        <article className="panel signal-tile reverse-tile">
          <PanelTitle icon={<DocumentIcon />} label="REVERSE DNS" menu />
          <span className="data-label">rDNS</span>
          <StatusPill listed={false} status={result ? result.reverseDns ? "resolved" : "not-found" : "pending"} />
          <span className="small-caption mono-truncate" title={result?.reverseDns || ""}>{result?.reverseDns || (result ? "No reverse DNS record" : "Waiting for result")}</span>
        </article>

        <article className="panel speed-panel">
          <PanelTitle icon={<SpeedIcon />} label="BROWSER SPEED" menu />
          <div className="speed-readout">
            <strong>{speed ? speed.mbps : "—"}<span> Mbps</span></strong>
            {speed && <span className="speed-latency">{speed.latencyMs} ms</span>}
          </div>
          <div className={`speed-chart ${speedHistory.length ? "has-data" : ""}`}>
            <svg viewBox="0 0 320 72" preserveAspectRatio="none" aria-label="Recent browser speed test results">
              <defs>
                <linearGradient id="speed-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2ce5c3" stopOpacity=".25" />
                  <stop offset="100%" stopColor="#2ce5c3" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="chart-gridline" d="M0 18H320 M0 44H320 M0 70H320" />
              {speedPath && <>
                <path className="chart-area" d={`${speedPath} L320 72 L0 72 Z`} />
                <path className="chart-line" d={speedPath} />
              </>}
            </svg>
            {speedHistory.length < 2 && <span className="chart-empty">{speedHistory.length ? "Run another test to build a trend" : "Run a test to record a reading"}</span>}
          </div>
          <button className="speed-button" type="button" onClick={runSpeedTest} disabled={speedLoading}>
            {speedLoading ? "Testing…" : "Run speed test"}<span aria-hidden="true">↗</span>
          </button>
        </article>
      </section>
      </>}

      {activeSection === "ip-intelligence" && <IntelligenceSection result={result} />}
      {activeSection === "tools" && <ToolsSection
        result={result}
        speed={speed}
        speedLoading={speedLoading}
        searchIp={searchIp}
        onSearchChange={setSearchIp}
        onSearchSubmit={submitSearch}
        onResetSearch={resetSearch}
        onRunSpeedTest={runSpeedTest}
      />}
      {activeSection === "reports" && <ReportsSection result={result} onDownload={downloadReport} onPrint={() => window.print()} />}
      {activeSection === "privacy" && <PrivacySection />}

      <footer className="footer">
        <span className="footer-brand">IP<span>/</span>SENTINEL</span>
        <span>Public signals only · IP data is not persisted by this demo.</span>
        <span className="footer-live"><span />{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Awaiting first check"}</span>
      </footer>
    </main>
  );
}

function PanelTitle({ icon, label, menu = false }: { icon: React.ReactNode; label: string; menu?: boolean }) {
  return <div className="panel-title"><span className="panel-icon">{icon}</span><span>{label}</span>{menu && <span className="panel-menu" aria-hidden="true">•••</span>}</div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="detail-row"><span>{label}</span><strong title={value}>{value}</strong></div>;
}

function StatusPill({ listed, status }: { listed: boolean; status: string }) {
  const label = listed ? "LISTED" : status === "checked" ? "CLEAN" : status === "resolved" ? "RESOLVED" : status === "not-found" ? "NOT FOUND" : status === "unavailable" ? "UNAVAILABLE" : status === "pending" ? "PENDING" : status.toUpperCase();
  const tone = listed ? "danger" : status === "checked" || status === "resolved" ? "good" : "muted";
  return <span className={`status-pill ${tone}`}><span className="status-check">{tone === "good" ? "✓" : tone === "danger" ? "!" : "·"}</span>{label}</span>;
}

function flagEmoji(countryCode: string) {
  const code = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((letter) => letter.charCodeAt(0) + 127397));
}

function formatBlacklistName(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("spamcop")) return "SpamCop";
  if (normalized.includes("dronebl")) return "DroneBL";
  return name;
}

function formatCoordinates(latitude?: number, longitude?: number) {
  if (typeof latitude !== "number" || typeof longitude !== "number") return "Unavailable";
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

function buildSparkline(values: number[]) {
  if (values.length < 2) return "";
  const maximum = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 320 : (index / (values.length - 1)) * 320;
    const y = 64 - (value / maximum) * 48;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M${points.join(" L")}`;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4" /><path d="m16 16 4.2 4.2" /></svg>;
}
function ShieldIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5.6c0 4.5-3.1 7.7-8 9.4-4.9-1.7-8-4.9-8-9.4V6l8-3Z" /><path d="m8.7 12 2.2 2.2 4.6-4.7" /></svg>;
}
function PinIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}
function BuildingIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="11" height="18" rx="1" /><path d="M15 9h5v12h-5M8 7h3M8 11h3M8 15h3M8 19h3M17.5 13h.1M17.5 17h.1" /></svg>;
}
function SignalIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18.5h2.5V21H4zM10.8 13.5h2.5V21h-2.5zM17.5 7h2.5v14h-2.5zM4 4.5h2.5V7H4z" /></svg>;
}
function DocumentIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></svg>;
}
function SpeedIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 18a9 9 0 1 1 15 0" /><path d="m12 13 4.5-5M7 18h10" /><circle cx="12" cy="13" r="1" /></svg>;
}
