"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../../components/protocol/PageShell";
import { fetchVaultCustodyMapSummary } from "../lib/vaultDocumentClient";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCustodyMap() {
      setLoading(true);
      setError("");
      try {
        const response = await fetchVaultCustodyMapSummary();
        if (!response.ok) {
          throw new Error(response.data?.error || "Unable to load custody map.");
        }
        if (!cancelled) {
          setSummary(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load custody map.");
          setSummary(null);
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
