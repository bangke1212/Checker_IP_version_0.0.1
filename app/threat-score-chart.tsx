import type { CheckResult } from "./types";

const RING_CIRCUMFERENCE = 326.73;
const POINTS_PER_LISTING = 35;

export default function ThreatScoreChart({ result }: { result: CheckResult }) {
  const checkedSources = result.blacklists.filter((source) => source.status === "checked").length;
  const totalSources = result.blacklists.length;
  const hasData = checkedSources > 0;
  const score = Math.max(0, Math.min(100, result.threatScore));
  const level = !hasData ? "NO DATA" : score >= 70 ? "HIGH" : score > 0 ? "ELEVATED" : "NO LISTINGS";
  const tone = !hasData ? "no-data" : score >= 70 ? "high" : score > 0 ? "elevated" : "low";

  return <article className="threat-score-panel" aria-labelledby="threat-score-title">
    <header className="threat-score-head">
      <div className="threat-score-title">
        <span className="data-label">CURRENT SCAN · PUBLIC SIGNALS</span>
        <h3 id="threat-score-title">Threat score breakdown</h3>
        <p>Threat score is the inverse of the dashboard health score.</p>
      </div>
      <span className={`threat-level is-${tone}`}>{level}</span>
    </header>

    <div className="threat-score-layout">
      <div className="threat-gauge">
        <svg viewBox="0 0 144 144" role="img" aria-label={`Threat score ${hasData ? score : "unavailable"} out of 100`}>
          <circle className="threat-gauge-track" cx="72" cy="72" r="52" />
          <circle
            className={`threat-gauge-value is-${tone}`}
            cx="72"
            cy="72"
            r="52"
            transform="rotate(-90 72 72)"
            style={{ strokeDasharray: `${hasData ? (score / 100) * RING_CIRCUMFERENCE : 0} ${RING_CIRCUMFERENCE}` }}
          />
        </svg>
        <div className="threat-gauge-center" aria-hidden="true">
          <strong>{hasData ? score : "—"}</strong>
          <span>/ 100</span>
          <small>THREAT</small>
        </div>
      </div>

      <div className="threat-score-content">
        <div className="threat-score-meta">
          <div><span>Source coverage</span><strong>{checkedSources} / {totalSources} checked</strong></div>
          <div><span>Health score</span><strong>{result.score} / 100</strong></div>
        </div>
        <div className="threat-source-list" aria-label="Threat score contribution by DNS blocklist">
          {result.blacklists.map((source) => {
            const checked = source.status === "checked";
            const contribution = checked && source.listed ? POINTS_PER_LISTING : 0;
            const sourceState = !checked ? "unavailable" : source.listed ? "listed" : "clean";
            const sourceLabel = !checked ? "UNAVAILABLE" : source.listed ? `LISTED · +${POINTS_PER_LISTING}` : "CLEAN · +0";
            return <div className="threat-source-row" key={source.name}>
              <div className="threat-source-heading">
                <span>{formatSourceName(source.name)}</span>
                <strong className={`is-${sourceState}`}>{sourceLabel}</strong>
              </div>
              <div className={`threat-bar-track is-${sourceState}`} aria-hidden="true">
                <span style={{ width: `${contribution}%` }} />
              </div>
            </div>;
          })}
        </div>
      </div>
    </div>

    {checkedSources < totalSources && <p className="threat-coverage-warning" role="note">
      Coverage is incomplete: unavailable sources are not counted as clean.
    </p>}
    <p className="threat-score-note">
      Each confirmed DNSBL listing adds {POINTS_PER_LISTING} points. This is a snapshot of configured public blocklists—not an overall probability of abuse—and the app does not retain a historical trend.
    </p>
  </article>;
}

function formatSourceName(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("spamcop")) return "SpamCop";
  if (normalized.includes("dronebl")) return "DroneBL";
  return name;
}
