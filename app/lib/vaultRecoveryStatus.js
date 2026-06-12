export const VAULT_RECOVERY_KIT_AVAILABLE = false;

export const VAULT_RECOVERY_WARNING =
  "No Recovery Kit yet. Losing this device or forgetting your PIN may permanently lock your vault.";

export function shouldShowVaultRecoveryWarning() {
  return !VAULT_RECOVERY_KIT_AVAILABLE;
}
