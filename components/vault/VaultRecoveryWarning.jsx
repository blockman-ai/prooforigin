import {
  shouldShowVaultRecoveryWarning,
  VAULT_RECOVERY_NOT_CONFIGURED_WARNING,
  VAULT_RECOVERY_WARNING,
} from "../../app/lib/vaultRecoveryStatus.js";

export default function VaultRecoveryWarning({ className = "" }) {
  if (!shouldShowVaultRecoveryWarning()) {
    return null;
  }

  return (
    <div
      className={`alert-banner alert-banner--warning vault-recovery-warning ${className}`.trim()}
      role="status"
    >
      <strong>Recovery not configured</strong>
      <p>{VAULT_RECOVERY_NOT_CONFIGURED_WARNING}</p>
      <p>{VAULT_RECOVERY_WARNING}</p>
    </div>
  );
}
