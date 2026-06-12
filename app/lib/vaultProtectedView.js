export function startProtectedViewSession() {
  return {
    view_session_id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    ended_at: null,
    viewed_event_recorded: false,
  };
}

export function endProtectedViewSession(session) {
  if (!session) return null;
  if (!session.ended_at) {
    session.ended_at = new Date().toISOString();
  }
  return session;
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
