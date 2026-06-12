export function startProtectedViewSession() {
  return {
    view_session_id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    ended_at: null,
    view_started_recorded: false,
    view_ended_recorded: false,
  };
}

export function endProtectedViewSession(session) {
  if (!session) return null;
  if (!session.ended_at) {
    session.ended_at = new Date().toISOString();
  }
  return session;
}

export function computeProtectedViewDurationMs(session) {
  if (!session?.started_at) return null;

  const endedAt = session.ended_at || new Date().toISOString();
  const startedMs = new Date(session.started_at).getTime();
  const endedMs = new Date(endedAt).getTime();

  if (Number.isNaN(startedMs) || Number.isNaN(endedMs)) {
    return null;
  }

  return Math.max(0, endedMs - startedMs);
}

export function formatShortVaultId(vaultId) {
  if (!vaultId || typeof vaultId !== "string") return "—";
  const compact = vaultId.replace(/-/g, "");
  return compact.slice(0, 8).toUpperCase();
}

export function formatProtectedViewTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
