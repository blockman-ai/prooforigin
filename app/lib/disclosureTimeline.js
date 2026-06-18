export const DISCLOSURE_TIMELINE_EVENT_LABELS = Object.freeze({
  "grant.created": "Grant created",
  "recipient.accepted": "Recipient accepted",
  "access.receipted": "Access receipted",
  "grant.verified": "Grant verified",
  "grant.revoked": "Grant revoked",
  "grant.expired": "Grant expired",
  "access.denied": "Access denied",
  "custody.blocked": "Custody blocked",
});

export const DISCLOSURE_TIMELINE_EVENT_VARIANTS = Object.freeze({
  "grant.created": "created",
  "recipient.accepted": "success",
  "access.receipted": "success",
  "grant.verified": "success",
  "grant.revoked": "revoked",
  "grant.expired": "expired",
  "access.denied": "denied",
  "custody.blocked": "warning",
});

export const DISCLOSURE_TIMELINE_RESULT_LABELS = Object.freeze({
  success: "Success",
  denied: "Denied",
  expired: "Expired",
  revoked: "Revoked",
});

export function formatDisclosureTimelineTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatDisclosureEventLabel(eventType) {
  return DISCLOSURE_TIMELINE_EVENT_LABELS[eventType] || eventType || "Event";
}

export function getDisclosureEventVariant(eventType) {
  return DISCLOSURE_TIMELINE_EVENT_VARIANTS[eventType] || "default";
}

export function formatDisclosureEventResult(result) {
  return DISCLOSURE_TIMELINE_RESULT_LABELS[result] || result || "Recorded";
}

export function buildDisclosureTimelineDetail(event) {
  if (!event) return null;

  const details = [];
  if (event.reason_code) {
    details.push(`Reason ${event.reason_code}`);
  }

  const metadata = event.metadata || {};
  if (typeof metadata.max_access_count === "number") {
    details.push(`Max access ${metadata.max_access_count}`);
  }
  if (typeof metadata.revoked_sessions === "number") {
    details.push(`Revoked sessions ${metadata.revoked_sessions}`);
  }

  return details.length > 0 ? details.join(" · ") : null;
}

export function sortDisclosureEventsNewestFirst(events = []) {
  return [...events].sort((left, right) => {
    const leftTime = Date.parse(String(left?.timestamp || ""));
    const rightTime = Date.parse(String(right?.timestamp || ""));
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return String(right?.event_id || "").localeCompare(String(left?.event_id || ""));
  });
}

export function buildDisclosureChainBadge(chain) {
  if (!chain) {
    return {
      variant: "pending",
      label: "Chain pending",
      detail: "Event chain verification has not completed.",
    };
  }

  if (chain.verified) {
    return {
      variant: "success",
      label: "Chain verified",
      detail: `${chain.event_count || 0} event${chain.event_count === 1 ? "" : "s"} verified.`,
    };
  }

  return {
    variant: "warning",
    label: "Chain integrity issue",
    detail: chain.reason || "Event chain verification failed.",
  };
}
