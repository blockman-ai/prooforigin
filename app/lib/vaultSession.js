export const VAULT_INACTIVITY_MS = 30_000;

export const VAULT_STATES = {
  LOCKED: "locked",
  UNLOCKED: "unlocked",
  VANISH: "vanish",
};

export const VAULT_VANISH_MESSAGE = "Vault protected. Re-authentication required.";

export function formatLastUnlockTime(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
