"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CheckResult = {
  checkedAt: string;
  clientIp: string;
  reverseDns: string | null;
  geo: {
    city?: string;
    region?: string;
    country?: string;
    country_code?: string;
    connection?: { isp?: string; org?: string; asn?: number; type?: string };
  } | null;
  blacklists: { name: string; listed: boolean; status: string }[];
  endpointChecks: { name: string; ok: boolean; status: number; latencyMs: number }[];
  score: number;
  status: "healthy" | "degraded" | "review";
  caveat: string;
};

type SpeedResult = { mbps: number; latencyMs: number; bytes: number };

const STATUS_LABELS = {
  healthy: "HEALTHY",
  degraded: "DEGRADED",
  review: "REVIEW",
};

export default function Home() {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [speed, setSpeed] = useState<SpeedResult | null>(null);
  const [speedLoading, setSpeedLoading] = useState(false);
  const [wallet, setWallet] = useState("");

  const checkIp = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/check?ts=${Date.now()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "IP check failed");
      setResult(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete IP check");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkIp();
    const timer = window.setInterval(checkIp, 30_000);
    return () => window.clearInterval(timer);
  }, [checkIp]);

  const runSpeedTest = async () => {
    setSpeedLoading(true);
    setSpeed(null);
    const bytes = 1_000_000;
    const started = performance.now();
    try {
      const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}&ts=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Speed endpoint unavailable");
      await response.arrayBuffer();
      const seconds = Math.max((performance.now() - started) / 1000, 0.01);
      setSpeed({ mbps: Number(((bytes * 8) / seconds / 1_000_000).toFixed(2)), latencyMs: Math.round(performance.now() - started), bytes });
    } catch {
      setError("Speed test gagal dari browser ini. Coba lagi atau periksa jaringan.");
    } finally {
      setSpeedLoading(false);
    }
  };

  const connectWallet = async () => {
    const ethereum = (window as Window & { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
    if (!ethereum) {
      setError("Wallet EVM tidak ditemukan. Dashboard tetap dapat digunakan tanpa wallet.");
      return;
    }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      setWallet(accounts[0] || "");
    } catch {
      setError("Koneksi wallet dibatalkan.");
    }
  };

  const location = useMemo(() => {
    if (!result?.geo) return "Location unavailable";
    return [result.geo.city, result.geo.region, result.geo.country].filter(Boolean).join(", ");
  }, [result]);

  const scoreTone = result?.status === "healthy" ? "good" : result?.status === "review" ? "bad" : "warn";

  return (
    <main className="shell">
      <nav className="nav">
        <div className="brand"><span className="brand-mark">◌</span><span>IP<span className="accent">/</span>SENTINEL</span></div>
        <div className="nav-actions">
          <span className="live-pill"><span className="pulse" /> LIVE CHECKS</span>
          <button className="wallet-button" onClick={connectWallet}>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}</button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">REAL-TIME NETWORK INTELLIGENCE / 0.0.1</p>
          <h1>Know your IP.<br /><span>Before it matters.</span></h1>
          <p className="lede">A live public-reputation and connectivity screen for operators, validators, and infrastructure teams. No credentials. No IP stored on-chain.</p>
          <div className="hero-actions"><button className="primary-button" onClick={checkIp}>{loading ? "Checking…" : "Run check now ↗"}</button><span className="refresh-note">Auto-refresh every 30 seconds</span></div>
        </div>
        <div className="orbital-card">
          <div className="orbital-grid" />
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="orbital-core"><span>IP</span><strong>{result?.score ?? "—"}</strong><small>HEALTH SCORE</small></div>
          <div className="orbit-label label-top">PUBLIC SIGNALS</div><div className="orbit-label label-bottom">LOW EXPOSURE</div>
        </div>
      </section>

      {error && <div className="notice error">{error}</div>}

      <section className="metrics-grid">
        <article className={`score-card ${scoreTone}`}>
          <div className="card-kicker">CURRENT VERDICT <span className="dot" /></div>
          <div className="score-row"><span className="score-number">{result?.score ?? "—"}</span><span className="score-unit">/ 100</span></div>
          <div className="status-word">{result ? STATUS_LABELS[result.status] : "SCANNING"}</div>
          <div className="progress"><span style={{ width: `${result?.score ?? 0}%` }} /></div>
          <p>{result?.caveat || "Waiting for the first live response."}</p>
        </article>
        <Metric label="PUBLIC IP" value={result?.clientIp || "—"} detail={result?.reverseDns || "Reverse DNS pending"} mono />
        <Metric label="NETWORK IDENTITY" value={result?.geo?.connection?.isp || "—"} detail={`${result?.geo?.connection?.type || "Unknown"} · ${location}`} />
      </section>

      <section className="content-grid">
        <div className="panel signals-panel">
          <div className="panel-header"><div><p className="eyebrow">SIGNAL MATRIX</p><h2>Reputation signals</h2></div><span className="timestamp">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Awaiting data"}</span></div>
          <div className="signal-list">
            {(result?.blacklists || [{ name: "Public DNSBLs", listed: false, status: "pending" }]).map((item) => <Signal key={item.name} name={item.name} value={item.status === "unavailable" ? "UNAVAILABLE" : item.listed ? "LISTED" : item.status === "pending" ? "PENDING" : "CLEAN"} bad={item.listed} />)}
            <Signal name="ASN / Provider" value={result?.geo?.connection?.org || "PENDING"} />
            <Signal name="Reverse DNS" value={result?.reverseDns ? "RESOLVED" : "NOT FOUND"} />
          </div>
        </div>
        <div className="panel speed-panel">
          <div className="panel-header"><div><p className="eyebrow">BROWSER PROBE</p><h2>Connection speed</h2></div><span className="speed-icon">↗</span></div>
          <div className="speed-number">{speed ? speed.mbps : "—"}<span> Mbps</span></div>
          <div className="speed-bar"><span style={{ width: `${Math.min(speed?.mbps || 0, 100)}%` }} /></div>
          <p className="muted">A lightweight client-side download test. This measures the browser connection, not a Vercel server IP.</p>
          <button className="secondary-button" onClick={runSpeedTest} disabled={speedLoading}>{speedLoading ? "Testing…" : "Run speed probe"}</button>
        </div>
      </section>

      <section className="panel endpoint-panel">
        <div className="panel-header"><div><p className="eyebrow">SERVICE REACHABILITY</p><h2>Endpoint heartbeat</h2></div><span className="muted">Server-side probe</span></div>
        <div className="endpoint-list">{(result?.endpointChecks || []).map((endpoint) => <div className="endpoint" key={endpoint.name}><span className={`endpoint-status ${endpoint.ok ? "up" : "down"}`} /><span>{endpoint.name.replace("https://", "")}</span><strong>{endpoint.ok ? `${endpoint.status} · ${endpoint.latencyMs} ms` : "OFFLINE"}</strong></div>)}</div>
      </section>

      <footer><span>IP/SENTINEL · PUBLIC SIGNALS ONLY</span><span>IP data is checked live and not persisted by this demo.</span></footer>
    </main>
  );
}

function Metric({ label, value, detail, mono = false }: { label: string; value: string; detail: string; mono?: boolean }) {
  return <article className="metric-card"><p className="card-kicker">{label}</p><div className={`metric-value ${mono ? "mono" : ""}`}>{value}</div><div className="metric-detail">{detail}</div></article>;
}

function Signal({ name, value, bad = false }: { name: string; value: string; bad?: boolean }) {
  return <div className="signal"><span className={`signal-dot ${bad ? "bad" : ""}`} /><span>{name}</span><strong className={bad ? "bad-text" : ""}>{value}</strong></div>;
}
