import {
  shouldShowVaultRecoveryWarning,
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
      <strong>Recovery not available yet</strong>
      <p>{VAULT_RECOVERY_WARNING}</p>
    </div>
  );
}
