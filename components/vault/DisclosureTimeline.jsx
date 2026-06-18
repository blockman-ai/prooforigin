"use client";

import ProtocolBadge from "../protocol/ProtocolBadge";
import {
  buildDisclosureChainBadge,
  buildDisclosureTimelineDetail,
  formatDisclosureEventLabel,
  formatDisclosureEventResult,
  formatDisclosureTimelineTimestamp,
  getDisclosureEventVariant,
  sortDisclosureEventsNewestFirst,
} from "../../app/lib/disclosureTimeline";

export default function DisclosureTimeline({
  events = [],
  chain = null,
  loading = false,
  error = "",
  emptyMessage = "No disclosure events recorded yet.",
}) {
  const entries = sortDisclosureEventsNewestFirst(events);
  const chainBadge = buildDisclosureChainBadge(chain);

  return (
    <section className="vault-timeline-card" aria-label="Disclosure event chain">
      <div className="vault-timeline-card__header">
        <h3 className="vault-timeline-card__title">Disclosure Events</h3>
        <ProtocolBadge variant={chainBadge.variant}>{chainBadge.label}</ProtocolBadge>
      </div>

      <p className="vault-timeline-card__lead">{chainBadge.detail}</p>

      {loading && <p className="vault-timeline-card__status">Loading disclosure events…</p>}

      {error && !loading && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Disclosure events unavailable</strong>
          {error}
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="vault-timeline__empty">{emptyMessage}</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <ol className="vault-timeline">
          {entries.map((event, index) => {
            const variant = getDisclosureEventVariant(event.event_type);
            const detail = buildDisclosureTimelineDetail(event);

            return (
              <li
                key={event.event_id || `${event.event_type}-${event.timestamp}-${index}`}
                className={`vault-timeline__item vault-timeline__item--${variant}`.trim()}
              >
                <span className="vault-timeline__node" aria-hidden="true" />
                <div className="vault-timeline__content">
                  <div className="vault-timeline__header">
                    <strong>{formatDisclosureEventLabel(event.event_type)}</strong>
                    <span className={`vault-timeline__pill vault-timeline__pill--${variant}`.trim()}>
                      {formatDisclosureEventResult(event.result)}
                    </span>
                  </div>
                  <time className="vault-timeline__time" dateTime={event.timestamp}>
                    {formatDisclosureTimelineTimestamp(event.timestamp)}
                  </time>
                  {detail && <p className="vault-timeline__detail">{detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
