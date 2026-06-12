"use client";

import { useEffect, useMemo, useState } from "react";
import { readVaultGenesis } from "../../app/lib/vaultGenesis.js";
import { isVaultUsingMasterVaultKey } from "../../app/lib/vaultKeyRingStorage.js";
import { detectPasskeyCapabilities } from "../../app/lib/vaultPasskey.js";
import { enrollVaultPasskey } from "../../app/lib/vaultPasskeyEnroll.js";
import { loadPasskeyWrapRecord } from "../../app/lib/vaultPasskeyStorage.js";
import {
  canEnrollVaultPasskey,
  getPasskeyStatusSummary,
  mapPasskeyEnrollmentError,
} from "../../app/lib/vaultPasskeyStatus.js";
import { getVaultSessionUnlockKeys } from "../../app/lib/vaultSession.js";

export default function VaultPasskeySection({ onPasskeyChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recordVersion, setRecordVersion] = useState(0);
  const [passkeySupported, setPasskeySupported] = useState(null);

  const mvkVault = isVaultUsingMasterVaultKey();
  const passkeyRecord = useMemo(() => loadPasskeyWrapRecord(), [recordVersion]);
  const status = useMemo(() => getPasskeyStatusSummary(passkeyRecord), [passkeyRecord]);

  const unlockKeys = getVaultSessionUnlockKeys();
  const canEnroll = useMemo(
    () => canEnrollVaultPasskey({ mvkVault, unlockKeys }),
    [mvkVault, unlockKeys, recordVersion]
  );

  useEffect(() => {
    let active = true;

    detectPasskeyCapabilities().then((capabilities) => {
      if (active) {
        setPasskeySupported(capabilities.passkeyUnlockSupported);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleEnrollPasskey({ replace = false } = {}) {
    setError("");
    setSuccess("");

    const genesis = readVaultGenesis();
    const sessionKeys = getVaultSessionUnlockKeys();

    if (!genesis?.vault_id) {
      setError("Vault genesis is not available.");
      return;
    }

    if (!canEnrollVaultPasskey({ mvkVault, unlockKeys: sessionKeys })) {
      setError("Unlock the vault before enrolling a passkey.");
      return;
    }

    setBusy(true);

    try {
      const metadata = await enrollVaultPasskey({
        vaultId: genesis.vault_id,
        masterVaultKey: sessionKeys.masterVaultKey,
        legacyPinKey: sessionKeys.legacyPinKey,
        replace,
      });

      setRecordVersion((value) => value + 1);
      setSuccess(
        replace
          ? "Passkey replaced on this device. Use the new passkey or your PIN to unlock."
          : "Passkey enrolled on this device. You can unlock with passkey or PIN."
      );
      onPasskeyChanged?.(metadata);
    } catch (enrollError) {
      setError(mapPasskeyEnrollmentError(enrollError));
    } finally {
      setBusy(false);
    }
  }

  if (!mvkVault) {
    return (
      <section className="vault-recovery-card vault-passkey-card" aria-label="Vault Passkey">
        <h3 className="vault-recovery-card__title">Passkey</h3>
        <p className="vault-recovery-card__lead">
          Passkeys are available for vaults created with the master vault key model. Legacy vaults
          must migrate before passkey enrollment is supported.
        </p>
      </section>
    );
  }

  return (
    <section className="vault-recovery-card vault-passkey-card" aria-label="Vault Passkey">
      <div className="vault-recovery-card__header">
        <h3 className="vault-recovery-card__title">Passkey</h3>
        <span
          className={`vault-recovery-card__status ${
            status.enrolled ? "vault-recovery-card__status--ready" : ""
          }`.trim()}
          aria-live="polite"
        >
          {status.statusLabel}
        </span>
      </div>

      <p className="vault-recovery-card__lead">
        Enroll a device passkey to unlock your vault with biometrics or screen lock. Your PIN
        remains available as fallback. ProofOrigin never receives your passkey secret or master
        vault key.
      </p>

      {status.enrolled && status.enrolledAtDisplay && (
        <p className="vault-passkey-card__meta" role="status">
          Enrolled {status.enrolledAtDisplay}
        </p>
      )}

      {passkeySupported === false && (
        <div className="alert-banner alert-banner--warning" role="status">
          <strong>Passkey unavailable</strong>
          <p>
            This device or browser does not support vault passkeys with PRF. Continue using your
            PIN to unlock.
          </p>
        </div>
      )}

      <div className="protocol-actions vault-recovery-card__actions">
        {!status.enrolled && (
          <button
            type="button"
            className="primary"
            disabled={!canEnroll || busy || passkeySupported === false}
            onClick={() => handleEnrollPasskey({ replace: false })}
            aria-busy={busy}
          >
            {busy ? "Enrolling…" : "Enroll Passkey"}
          </button>
        )}

        {status.enrolled && (
          <button
            type="button"
            className="secondary"
            disabled={!canEnroll || busy || passkeySupported === false}
            onClick={() => handleEnrollPasskey({ replace: true })}
            aria-busy={busy}
          >
            {busy ? "Replacing…" : "Replace Passkey"}
          </button>
        )}
      </div>

      {status.enrolled && (
        <p className="vault-recovery-card__hint">
          Replace creates a new passkey wrap on this device. Keep your PIN as backup if replace is
          interrupted.
        </p>
      )}

      {error && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Passkey error</strong>
          {error}
        </div>
      )}

      {success && (
        <div className="alert-banner alert-banner--success" role="status">
          <strong>Passkey update</strong>
          {success}
        </div>
      )}
    </section>
  );
}
