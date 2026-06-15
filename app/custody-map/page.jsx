"use client";

import { useEffect, useMemo, useState } from "react";
import PageShell from "../../components/protocol/PageShell";
import {
  fetchVaultCustodyMapSummary,
  fetchVaultCustodyTimeline,
  fetchVaultCustodyIntelligence,
} from "../lib/vaultDocumentClient";

const ACTIVE_TRUST_SIGNALS = [
  ["Ownership", "ownership_confidence"],
  ["Devices", "device_stability"],
  ["Transfers", "migration_reliability"],
  ["Cleanup", "cleanup_hygiene"],
  ["Old copies", "retirement_hygiene"],
];

const PENDING_ACTION_LABELS = {
  ownership_verification_required: "Verify device ownership",
  cleanup_pending: "Finish cleanup after a transfer",
  retirement_eligible: "Remove an old copy",
  compromised_document_review: "Review a document that needs attention",
};

const ANOMALY_LABELS = {
  "Unusual document custody activity in the last hour": "Unusual document activity in the last hour",
  "Unusual device registration or revocation activity": "Unusual device activity recently",
  "One or more active devices require ownership verification": "One or more devices need ownership verification",
  "Migration failures elevated in the last 7 days": "More transfer failures than usual this week",
  "Repeated migration failures on the same device route": "Transfer failed more than once between the same devices",
  "A migration appears stalled in progress": "A device transfer seems stuck",
  "Migration staging cleanup is still pending": "Cleanup still needed after a transfer",
  "Source retirement has been eligible for an extended period": "An old copy has been waiting to be removed",
  "Compromised document requires review": "A document needs your review",
};

const BAND_DISPLAY_LABELS = {
  clear: "Protected",
  watch: "Watch",
  attention: "Needs attention",
  critical: "Urgent",
};

const TIMELINE_TITLE_LABELS = {
  "Document created": "Document added to your vault",
  "Document marked compromised": "Document marked for review",
  "Document deleted": "Document removed",
  "Device registered": "New device added",
  "Device bound to vault": "Device linked to your vault",
  "Device revoked": "Device access removed",
  "Ownership key registered": "Vault ownership key created",
  "Ownership verified": "Device verified",
  "Migration planned": "Device transfer planned",
  "Migration upload started": "Transfer started",
  "Staging verified": "Transfer verified",
  "Migrated to new device": "Moved to a new device",
  "Staging cleanup pending": "Cleanup still needed",
  "Cleanup completed": "Cleanup finished",
  "Cleanup failed": "Cleanup could not finish",
  "Source retirement available": "Old copy can be removed",
  "Source retired": "Old copy removed",
};

const CONTENT_TYPE_LABELS = {
  "application/pdf": "PDF",
  "image/jpeg": "Photo",
  "image/png": "Photo",
  "image/webp": "Photo",
  "image/heic": "Photo",
  "text/plain": "Text file",
};

const CUSTODY_STATE_LABELS = {
  active: "Protected",
  compromised: "Review needed",
  retired: "Removed",
};

const EMPTY_VALUE = "Not available";

function looksLikeTechnicalId(value) {
  if (!value || typeof value !== "string") {
    return true;
  }
  const trimmed = value.trim();
  return /^vdp[_-]/i.test(trimmed) || /^[a-f0-9-]{20,}$/i.test(trimmed);
}

function formatDeviceName(devicePublicId, fallback = "Your device") {
  if (!devicePublicId || looksLikeTechnicalId(devicePublicId)) {
    return fallback;
  }
  return devicePublicId;
}

function formatDocumentLabel(contentTypeHint) {
  if (!contentTypeHint) {
    return "Protected document";
  }
  const normalized = contentTypeHint.trim().toLowerCase();
  return CONTENT_TYPE_LABELS[normalized] || "Protected document";
}

function humanizeBandLabel(band) {
  return BAND_DISPLAY_LABELS[band] || band;
}

function formatTimestamp(value) {
  if (!value) return EMPTY_VALUE;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return EMPTY_VALUE;
  }
}

function humanizeTimelineTitle(title) {
  return TIMELINE_TITLE_LABELS[title] || title.replace(/^Migration to /, "Moved to ");
}

function humanizePendingAction(action) {
  if (PENDING_ACTION_LABELS[action.type]) {
    return PENDING_ACTION_LABELS[action.type];
  }
  const backendLabelMap = {
    "Ownership verification required": PENDING_ACTION_LABELS.ownership_verification_required,
    "Migration cleanup pending": PENDING_ACTION_LABELS.cleanup_pending,
    "Source retirement eligible": PENDING_ACTION_LABELS.retirement_eligible,
    "Compromised document review required": PENDING_ACTION_LABELS.compromised_document_review,
  };
  return backendLabelMap[action.label] || action.label;
}

function humanizeIssueLabel(label) {
  if (!label) {
    return null;
  }
  return ANOMALY_LABELS[label] || label;
}

function trustHeroVariantFromAttention({ hasCriticalAnomaly, needsAttention }) {
  if (hasCriticalAnomaly) {
    return { band: "critical", variant: "critical" };
  }
  if (needsAttention) {
    return { band: "attention", variant: "warning" };
  }
  return { band: "clear", variant: "success" };
}

function buildTrustHero(intelligence, pendingActions) {
  const anomalies = intelligence?.anomalies || [];
  const pending = pendingActions || [];
  const actionItemCount = pending.reduce((sum, action) => sum + (action.count || 0), 0);
  const hasCriticalAnomaly = anomalies.some((anomaly) => anomaly.severity === "critical");
  const needsAttention = actionItemCount > 0 || anomalies.length > 0;

  let headline = "Your vault is protected.";
  if (needsAttention) {
    const count =
      actionItemCount > 0 ? actionItemCount : anomalies.length > 0 ? anomalies.length : 1;
    headline = `${count} item${count === 1 ? "" : "s"} require${count === 1 ? "s" : ""} attention.`;
  }

  const topIssue =
    (pending[0] ? humanizePendingAction(pending[0]) : null) ||
    humanizeIssueLabel(anomalies[0]?.label) ||
    null;

  const { band, variant } = trustHeroVariantFromAttention({
    hasCriticalAnomaly,
    needsAttention,
  });

  return {
    band,
    bandLabel: humanizeBandLabel(band),
    headline,
    topIssue,
    score: intelligence?.health?.score ?? null,
    variant,
  };
}

function buildTimelineBlocks(timeline) {
  if (!timeline?.entries?.length) {
    return [];
  }

  const groupsMeta = new Map((timeline.groups || []).map((group) => [group.group_id, group]));
  const byGroup = new Map();
  const standalone = [];

  for (const entry of timeline.entries) {
    if (entry.group_id && groupsMeta.has(entry.group_id)) {
      if (!byGroup.has(entry.group_id)) {
        byGroup.set(entry.group_id, []);
      }
      byGroup.get(entry.group_id).push(entry);
    } else {
      standalone.push(entry);
    }
  }

  const blocks = [];

  for (const [groupId, entries] of byGroup) {
    const meta = groupsMeta.get(groupId);
    const sortKey =
      entries.reduce((latest, entry) => {
        const time = new Date(entry.occurred_at).getTime();
        return time > latest ? time : latest;
      }, 0) || 0;

    blocks.push({
      type: "migration",
      key: groupId,
      title: humanizeTimelineTitle(meta?.title || "Device transfer"),
      entries,
      sortKey,
    });
  }

  for (const entry of standalone) {
    blocks.push({
      type: "entry",
      key: entry.entry_ref,
      entry,
      sortKey: new Date(entry.occurred_at).getTime() || 0,
    });
  }

  return blocks.sort((left, right) => right.sortKey - left.sortKey);
}

function EmptyNote({ children }) {
  return <p className="custody-map__muted">{children}</p>;
}

function StatusPill({ children, variant = "neutral" }) {
  return <span className={`custody-pill custody-pill--${variant}`.trim()}>{children}</span>;
}

function TimelineEntry({ entry }) {
  return (
    <li
      className={`custody-timeline__item custody-timeline__item--${entry.severity}`}
    >
      <div className="custody-timeline__date">{entry.display_date || EMPTY_VALUE}</div>
      <div className="custody-timeline__content">
        <strong>{humanizeTimelineTitle(entry.title)}</strong>
        {entry.subtitle && !looksLikeTechnicalId(entry.subtitle) && (
          <span>{entry.subtitle}</span>
        )}
      </div>
    </li>
  );
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

  const trustHero = useMemo(
    () => buildTrustHero(intelligence, summary?.pending_actions),
    [intelligence, summary?.pending_actions]
  );

  const activeTrustSignals = useMemo(() => {
    const signals = intelligence?.signals || {};
    return ACTIVE_TRUST_SIGNALS.map(([label, key]) => ({
      label,
      signal: signals[key],
    })).filter(({ signal }) => signal);
  }, [intelligence]);

  const timelineBlocks = useMemo(() => buildTimelineBlocks(timeline), [timeline]);

  return (
    <PageShell
      badge="Custody Map"
      title="Your vault, at a glance."
      subtitle="See what you own, which devices can access it, and what needs your attention."
      className="custody-map-page"
      heroAlign="left"
    >
      {loading && <p className="custody-map__status">Loading your vault...</p>}

      {error && !loading && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Custody map unavailable</strong>
          {error}
        </div>
      )}

      {!loading && !error && summary && (
        <div className="custody-map">
          <section
            className={`custody-trust-hero custody-trust-hero--${trustHero.variant}`}
            aria-label="Vault protection status"
          >
            <div className="custody-trust-hero__content">
              <p className="custody-trust-hero__eyebrow">Vault protection</p>
              <h2 className="custody-trust-hero__headline">{trustHero.headline}</h2>
              {trustHero.topIssue && (
                <p className="custody-trust-hero__issue">{trustHero.topIssue}</p>
              )}
              {!trustHero.topIssue && trustHero.band === "clear" && (
                <p className="custody-trust-hero__issue">Everything looks protected.</p>
              )}
            </div>
            {intelligence && (
              <div className="custody-trust-hero__meta">
                <StatusPill variant={trustHero.variant}>{trustHero.bandLabel}</StatusPill>
                {trustHero.score != null && (
                  <span className="custody-trust-hero__score">Trust score {trustHero.score}/100</span>
                )}
              </div>
            )}
            {activeTrustSignals.length > 0 && (
              <div className="custody-trust-signals" aria-label="Protection checks">
                {activeTrustSignals.map(({ label, signal }) => (
                  <div
                    key={label}
                    className={`custody-trust-signal custody-trust-signal--${signal.band}`}
                  >
                    <span>{label}</span>
                    <strong>{humanizeBandLabel(signal.band)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="custody-panel custody-panel--primary" aria-label="What needs your attention">
            <div className="custody-panel__header">
              <h2>What needs your attention</h2>
              <StatusPill variant={summary.pending_actions.length > 0 ? "warning" : "success"}>
                {summary.pending_actions.length > 0 ? "Review needed" : "Protected"}
              </StatusPill>
            </div>
            {summary.pending_actions.length === 0 ? (
              <EmptyNote>Nothing needs your attention right now.</EmptyNote>
            ) : (
              <ul className="custody-action-list">
                {summary.pending_actions.map((action) => (
                  <li key={action.type} className={`custody-action-list__item custody-action-list__item--${action.severity}`}>
                    <strong>{humanizePendingAction(action)}</strong>
                    <span>
                      {action.count} item{action.count === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="custody-map__columns">
            <section className="custody-panel" aria-label="Your devices">
              <div className="custody-panel__header">
                <h2>Your devices</h2>
                <StatusPill>{summary.devices.length}</StatusPill>
              </div>
              {summary.devices.length === 0 ? (
                <EmptyNote>No devices linked yet.</EmptyNote>
              ) : (
                <ul className="custody-list">
                  {summary.devices.map((device, index) => (
                    <li key={`${device.device_public_id || "device"}-${index}`}>
                      <strong>{formatDeviceName(device.device_public_id)}</strong>
                      <span>
                        {device.revoked
                          ? "Access removed"
                          : device.verified
                            ? "Device verified"
                            : "Verification needed"}
                      </span>
                      <small>Last seen {formatTimestamp(device.last_seen_at)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="custody-panel" aria-label="Your documents">
              <div className="custody-panel__header">
                <h2>Your documents</h2>
                <StatusPill>{summary.documents.length}</StatusPill>
              </div>
              {summary.documents.length === 0 ? (
                <EmptyNote>No documents in your vault yet.</EmptyNote>
              ) : (
                <ul className="custody-list">
                  {summary.documents.map((document) => (
                    <li key={document.document_ref}>
                      <strong>{formatDocumentLabel(document.content_type_hint)}</strong>
                      <span>
                        {CUSTODY_STATE_LABELS[document.custody_state] || "Protected"}
                      </span>
                      <small>
                        {formatDeviceName(document.device_public_id)} ·{" "}
                        {formatTimestamp(document.created_at)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="custody-panel" aria-label="Recent activity">
            <div className="custody-panel__header">
              <h2>Recent activity</h2>
              <StatusPill>{timeline?.entries?.length || 0}</StatusPill>
            </div>
            {timelineBlocks.length === 0 ? (
              <EmptyNote>No recent activity yet.</EmptyNote>
            ) : (
              <div className="custody-timeline-flow">
                {timelineBlocks.map((block) =>
                  block.type === "migration" ? (
                    <article key={block.key} className="custody-timeline-group">
                      <header className="custody-timeline-group__header">
                        <strong>{block.title}</strong>
                        <span>{block.entries.length} updates</span>
                      </header>
                      <ol className="custody-timeline custody-timeline--nested">
                        {block.entries.map((entry) => (
                          <TimelineEntry key={entry.entry_ref} entry={entry} />
                        ))}
                      </ol>
                    </article>
                  ) : (
                    <ol key={block.key} className="custody-timeline">
                      <TimelineEntry entry={block.entry} />
                    </ol>
                  )
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
