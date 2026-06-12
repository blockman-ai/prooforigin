"use client";

import {
  getPasskeyUnsupportedSectionCopy,
  PASSKEY_UNLOCK_UNAVAILABLE_MESSAGE,
} from "../../app/lib/vaultPasskeyStatus.js";

export default function VaultPasskeyUnsupportedNotice({ variant = "section" }) {
  if (variant === "unlock") {
    return (
      <div
        className="alert-banner alert-banner--warning vault-passkey-unsupported vault-passkey-unsupported--unlock"
        role="status"
      >
        <p>{PASSKEY_UNLOCK_UNAVAILABLE_MESSAGE}</p>
      </div>
    );
  }

  const copy = getPasskeyUnsupportedSectionCopy();

  return (
    <div className="vault-passkey-unsupported" role="status" aria-label="Passkey support guidance">
      <div className="alert-banner alert-banner--warning vault-passkey-unsupported__banner">
        <strong>{copy.headline}</strong>
        <p>{copy.lead}</p>
        <p>{copy.pinRecovery}</p>
      </div>

      <div className="vault-passkey-unsupported__recommendations">
        <p className="vault-passkey-unsupported__label">Recommended browsers</p>
        <ul className="vault-passkey-unsupported__list">
          {copy.recommendations.map((item) => (
            <li key={item.platform}>
              <strong>{item.platform}:</strong> {item.browser}
            </li>
          ))}
        </ul>
      </div>

      <p className="vault-recovery-card__hint">{copy.inAppWarning}</p>

      <details className="vault-passkey-unsupported__why">
        <summary>{copy.whySummary}</summary>
        <div className="vault-passkey-unsupported__why-body">
          {copy.whyDetails.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </details>
    </div>
  );
}
