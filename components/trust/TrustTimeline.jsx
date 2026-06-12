import ProtocolBadge from "../protocol/ProtocolBadge";
import {
  formatCardDateTime,
  formatTrustStateLabel,
  trustStateBadgeVariant,
} from "../../app/lib/identityCardShared";

function formatEventLabel(eventType) {
  if (!eventType) return "Event";
  return eventType.charAt(0).toUpperCase() + eventType.slice(1);
}

function truncateHash(hash, head = 10, tail = 6) {
  if (!hash || hash.length <= head + tail + 3) return hash || "—";
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export default function TrustTimeline({ events = [], emptyMessage = "No trust events recorded yet." }) {
  if (events.length === 0) {
    return <p className="trust-timeline__empty">{emptyMessage}</p>;
  }

  return (
    <ol className="trust-timeline">
      {events.map((event, index) => (
        <li key={event.id || `${event.event_type}-${event.created_at}-${index}`} className="trust-timeline__item">
          <span className="trust-timeline__node" aria-hidden="true" />
          <div className="trust-timeline__content">
            <div className="trust-timeline__header">
              <strong>{formatEventLabel(event.event_type)}</strong>
              <ProtocolBadge variant={trustStateBadgeVariant(event.trust_state)}>
                {formatTrustStateLabel(event.trust_state)}
              </ProtocolBadge>
            </div>
            <time className="trust-timeline__time" dateTime={event.created_at}>
              {formatCardDateTime(event.created_at)}
            </time>
            {event.card_state_hash && (
              <p className="trust-timeline__hash identity-card-inline-mono">
                {truncateHash(event.card_state_hash)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
