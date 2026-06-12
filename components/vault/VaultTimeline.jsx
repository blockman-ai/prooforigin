"use client";

import {
  buildVaultTimelineDetail,
  buildVaultTimelineEntries,
  formatVaultTimelineTimestamp,
  getVaultTimelineEventVariant,
} from "../../app/lib/vaultTimeline";

function truncateHash(hash, head = 10, tail = 6) {
  if (!hash || hash.length <= head + tail + 3) return hash || null;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export default function VaultTimeline({
  genesis,
  events = [],
  loading = false,
  error = "",
  emptyMessage = "No vault history yet.",
}) {
  const entries = buildVaultTimelineEntries({ genesis, events });

  return (
    <section className="vault-timeline-card" aria-label="Vault Timeline">
      <div className="vault-timeline-card__header">
        <h3 className="vault-timeline-card__title">Vault Timeline</h3>
        <span className="vault-timeline-card__badge">History</span>
      </div>

      <p className="vault-timeline-card__lead">
        Immutable custody events for this vault — newest first.
      </p>

      {loading && <p className="vault-timeline-card__status">Loading vault history…</p>}

      {error && !loading && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Vault history unavailable</strong>
          {error}
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="vault-timeline__empty">{emptyMessage}</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <ol className="vault-timeline">
          {entries.map((entry, index) => {
            const variant = getVaultTimelineEventVariant(entry.kind);
            const detail = buildVaultTimelineDetail(entry);
            const hashPreview = truncateHash(entry.state_hash);

            return (
              <li
                key={entry.id || `${entry.kind}-${entry.created_at}-${index}`}
                className={`vault-timeline__item vault-timeline__item--${variant}`.trim()}
              >
                <span className="vault-timeline__node" aria-hidden="true" />
                <div className="vault-timeline__content">
                  <div className="vault-timeline__header">
                    <strong>{entry.label}</strong>
                    <span className={`vault-timeline__pill vault-timeline__pill--${variant}`.trim()}>
                      {entry.kind === "genesis" ? "Sealed" : "Recorded"}
                    </span>
                  </div>
                  <time className="vault-timeline__time" dateTime={entry.created_at}>
                    {formatVaultTimelineTimestamp(entry.created_at)}
                  </time>
                  {detail && <p className="vault-timeline__detail">{detail}</p>}
                  {hashPreview && (
                    <p className="vault-timeline__hash" title={entry.state_hash}>
                      {hashPreview}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
