"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../../components/protocol/PageShell";
import { fetchVaultCustodyMapSummary, fetchVaultCustodyTimeline, fetchVaultCustodyIntelligence } from "../lib/vaultDocumentClient";

function formatTimestamp(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function SummaryCard({ label, value }) {
  return (
    <article className="custody-summary-card">
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </article>
  );
}

function EmptyNote({ children }) {
  return <p className="custody-map__muted">{children}</p>;
}

function StatusPill({ children, variant = "neutral" }) {
  return <span className={`custody-pill custody-pill--${variant}`.trim()}>{children}</span>;
}

export default function CustodyMapPage() {
  const [summary, setSummary] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCustodyMap() {
      setLoading(true);
      setError("");
      try {
        const [summaryResponse, timelineResponse, intelligenceResponse] = await Promise.all([
          fetchVaultCustodyMapSummary(),
          fetchVaultCustodyTimeline(50),
          fetchVaultCustodyIntelligence(),
        ]);
        if (!summaryResponse.ok) {
          throw new Error(summaryResponse.data?.error || "Unable to load custody map.");
        }
        if (!timelineResponse.ok) {
          throw new Error(timelineResponse.data?.error || "Unable to load custody timeline.");
        }
        if (!intelligenceResponse.ok) {
          throw new Error(intelligenceResponse.data?.error || "Unable to load custody intelligence.");
        }
        if (!cancelled) {
          setSummary(summaryResponse.data);
          setTimeline(timelineResponse.data?.timeline || null);
          setIntelligence(intelligenceResponse.data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load custody map.");
          setSummary(null);
          setTimeline(null);
          setIntelligence(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCustodyMap();
    return () => {
      cancelled = true;
    };
  }, []);

  const vaultSummary = summary?.vault?.summary || {};
  const healthItems = useMemo(() => {
    const sentinel = summary?.sentinel_summary || {};
    return [
      ["Migration success", sentinel.migration_success_count],
      ["Migration failure", sentinel.migration_failure_count],
      ["Cleanup pending", sentinel.cleanup_pending_count],
      ["Retirement pending", sentinel.retirement_pending_count],
      ["Compromised documents", sentinel.compromised_document_count],
    ];
  }, [summary]);

  const trustSignalItems = useMemo(() => {
    const signals = intelligence?.signals || {};
    return [
      ["Ownership confidence", signals.ownership_confidence],
      ["Device stability", signals.device_stability],
      ["Migration reliability", signals.migration_reliability],
      ["Cleanup hygiene", signals.cleanup_hygiene],
      ["Retirement hygiene", signals.retirement_hygiene],
      ["Storage integrity", signals.storage_integrity],
      ["Auth integrity", signals.auth_integrity],
      ["Identity trust", signals.identity_trust],
    ].filter(([, signal]) => signal);
  }, [intelligence]);

  return (
    <PageShell
      badge="Custody Map"
      title="See your vault custody at a glance."
      subtitle="A read-only dashboard for what you own, which devices can access it, what moved, and what needs attention."
      className="custody-map-page"
      heroAlign="left"
    >
      {loading && <p className="custody-map__status">Loading custody map...</p>}

      {error && !loading && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Custody map unavailable</strong>
          {error}
        </div>
      )}

      {!loading && !error && summary && (
        <div className="custody-map">
          <section className="custody-summary-grid" aria-label="Custody Summary">
            <SummaryCard label="Active documents" value={vaultSummary.active_documents} />
            <SummaryCard label="Retired sources" value={vaultSummary.retired_documents} />
            <SummaryCard label="Compromised" value={vaultSummary.compromised_documents} />
            <SummaryCard label="Verified devices" value={vaultSummary.verified_devices} />
            <SummaryCard label="Revoked devices" value={vaultSummary.revoked_devices} />
            <SummaryCard label="Completed migrations" value={vaultSummary.completed_migrations} />
            <SummaryCard label="Failed migrations" value={vaultSummary.failed_migrations} />
            <SummaryCard label="Cleanup pending" value={vaultSummary.cleanup_pending} />
            <SummaryCard label="Retirement eligible" value={vaultSummary.retirement_eligible} />
          </section>

          <section className="custody-panel" aria-label="Pending Actions">
            <div className="custody-panel__header">
              <h2>Pending Actions</h2>
              <StatusPill variant={summary.pending_actions.length > 0 ? "warning" : "success"}>
                {summary.pending_actions.length > 0 ? "Needs attention" : "Clear"}
              </StatusPill>
            </div>
            {summary.pending_actions.length === 0 ? (
              <EmptyNote>No custody actions are pending.</EmptyNote>
            ) : (
              <ul className="custody-list">
                {summary.pending_actions.map((action) => (
                  <li key={action.type}>
                    <strong>{action.label}</strong>
                    <span>{action.count} item{action.count === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="custody-map__columns">
            <section className="custody-panel" aria-label="Devices">
              <div className="custody-panel__header">
                <h2>Devices</h2>
                <StatusPill>{summary.devices.length}</StatusPill>
              </div>
              {summary.devices.length === 0 ? (
                <EmptyNote>No devices found.</EmptyNote>
              ) : (
                <ul className="custody-list">
                  {summary.devices.map((device, index) => (
                    <li key={`${device.device_public_id || "device"}-${index}`}>
                      <strong>{device.device_public_id || "Vault device"}</strong>
                      <span>
                        {device.revoked ? "Revoked" : device.verified ? "Verified" : "Verification required"}
                      </span>
                      <small>Last seen {formatTimestamp(device.last_seen_at)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="custody-panel" aria-label="Documents">
              <div className="custody-panel__header">
                <h2>Documents</h2>
                <StatusPill>{summary.documents.length}</StatusPill>
              </div>
              {summary.documents.length === 0 ? (
                <EmptyNote>No active custody documents found.</EmptyNote>
              ) : (
                <ul className="custody-list">
                  {summary.documents.map((document) => (
                    <li key={document.document_ref}>
                      <strong>{document.content_type_hint || "Encrypted document"}</strong>
                      <span>{document.custody_state}</span>
                      <small>
                        {document.device_public_id || "Vault device"} -{" "}
                        {formatTimestamp(document.created_at)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="custody-panel" aria-label="Migrations">
            <div className="custody-panel__header">
              <h2>Migrations</h2>
              <StatusPill>{summary.migrations.length}</StatusPill>
            </div>
            {summary.migrations.length === 0 ? (
              <EmptyNote>No migration lifecycle records yet.</EmptyNote>
            ) : (
              <ul className="custody-list custody-list--timeline">
                {summary.migrations.map((migration) => (
                  <li key={migration.migration_ref}>
                    <strong>{migration.status_label}</strong>
                    <span>
                      {migration.source_device_public_id || "Source device"} to{" "}
                      {migration.target_device_public_id || "Target device"}
                    </span>
                    <small>
                      {migration.state}
                      {migration.cleanup_pending ? " - cleanup pending" : ""}
                      {migration.retirement_eligible ? " - retirement eligible" : ""}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="custody-panel" aria-label="Sentinel Intelligence">
            <div className="custody-panel__header">
              <h2>Sentinel Intelligence</h2>
              <StatusPill
                variant={
                  intelligence?.health?.band === "critical"
                    ? "critical"
                    : intelligence?.health?.band === "attention"
                      ? "warning"
                      : intelligence?.health?.band === "watch"
                        ? "neutral"
                        : "success"
                }
              >
                {intelligence?.health?.band || "—"}
              </StatusPill>
            </div>
            {!intelligence ? (
              <EmptyNote>Sentinel intelligence is unavailable.</EmptyNote>
            ) : (
              <>
                <div className="sentinel-health-summary">
                  <span>Overall custody health</span>
                  <strong>{intelligence.health?.score ?? "—"}</strong>
                </div>
                {intelligence.anomalies?.length > 0 ? (
                  <ul className="sentinel-anomaly-list">
                    {intelligence.anomalies.slice(0, 3).map((anomaly) => (
                      <li key={anomaly.kind}>
                        <strong>{anomaly.label}</strong>
                        <span>{anomaly.severity}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyNote>No active custody anomalies detected.</EmptyNote>
                )}
                {trustSignalItems.length > 0 && (
                  <div className="sentinel-signal-grid">
                    {trustSignalItems.map(([label, signal]) => (
                      <div key={label} className={`sentinel-signal sentinel-signal--${signal.band}`}>
                        <span>{label}</span>
                        <strong>{signal.score}</strong>
                        <small>{signal.band}</small>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="custody-panel" aria-label="Custody Timeline">
            <div className="custody-panel__header">
              <h2>Custody Timeline</h2>
              <StatusPill>{timeline?.entries?.length || 0}</StatusPill>
            </div>
            {!timeline || timeline.entries.length === 0 ? (
              <EmptyNote>No custody timeline events yet.</EmptyNote>
            ) : (
              <ol className="custody-timeline">
                {timeline.entries.map((entry) => (
                  <li key={entry.entry_ref} className={`custody-timeline__item custody-timeline__item--${entry.severity}`}>
                    <div className="custody-timeline__date">{entry.display_date || "—"}</div>
                    <div className="custody-timeline__content">
                      <strong>{entry.title}</strong>
                      {entry.subtitle && <span>{entry.subtitle}</span>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {timeline?.health_markers?.length > 0 && (
              <ul className="custody-timeline-markers">
                {timeline.health_markers.map((marker) => (
                  <li key={marker.kind}>{marker.label}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="custody-panel" aria-label="Custody Health">
            <div className="custody-panel__header">
              <h2>Custody Health</h2>
              <StatusPill>Aggregate</StatusPill>
            </div>
            <div className="custody-health-grid">
              {healthItems.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value ?? 0}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
