export const PASSKEY_UNSUPPORTED_HEADLINE = "Passkey unavailable on this browser or device";

export const PASSKEY_UNSUPPORTED_LEAD =
  "This browser or device does not support secure passkey encryption for this vault.";

export const PASSKEY_UNSUPPORTED_PIN_RECOVERY =
  "Your PIN and Recovery Kit still work on this device.";

export const PASSKEY_UNSUPPORTED_RECOMMENDATIONS = [
  { platform: "iPhone / iPad", browser: "Safari (latest)" },
  { platform: "Android", browser: "Chrome (latest)" },
  { platform: "Windows", browser: "Edge or Chrome with Windows Hello" },
  { platform: "Mac", browser: "Safari or Chrome with Touch ID" },
];

export const PASSKEY_UNSUPPORTED_IN_APP_WARNING =
  "In-app browsers (social apps, email wrappers) often block secure passkey encryption.";

export const PASSKEY_WHY_SUMMARY = "Why?";

export const PASSKEY_WHY_DETAILS = [
  "ProofOrigin requires secure passkey encryption support, not just basic passkey login.",
  "We do not enable fake passkey mode because it would weaken vault security.",
];

export const PASSKEY_UNLOCK_UNAVAILABLE_MESSAGE =
  "Passkey unavailable on this browser. Use PIN instead.";

export function formatPasskeyEnrolledAt(enrolledAt) {
  if (typeof enrolledAt !== "string" || !enrolledAt.trim()) {
    return null;
  }

  const date = new Date(enrolledAt);
  if (Number.isNaN(date.getTime())) {
    return enrolledAt.trim();
  }

  return date.toLocaleString();
}

export function getPasskeyStatusSummary(record) {
  if (!record) {
    return {
      enrolled: false,
      statusLabel: "Not enrolled",
      enrolledAt: null,
      enrolledAtDisplay: null,
    };
  }

  return {
    enrolled: true,
    statusLabel: "Enrolled",
    enrolledAt: record.enrolled_at || null,
    enrolledAtDisplay: formatPasskeyEnrolledAt(record.enrolled_at),
  };
}

export function canEnrollVaultPasskey({ mvkVault, unlockKeys }) {
  return (
    Boolean(mvkVault) &&
    unlockKeys?.mode === "mvk" &&
    unlockKeys?.masterVaultKey instanceof Uint8Array &&
    unlockKeys?.legacyPinKey instanceof Uint8Array
  );
}

export function isPasskeyUnlockButtonVisible({
  isSetupMode,
  enrolled,
  passkeySupported = null,
}) {
  if (isSetupMode || !enrolled || passkeySupported !== true) {
    return false;
  }

  return true;
}

export function getPasskeyUnlockLockScreenState({
  isSetupMode,
  enrolled,
  passkeySupported = null,
}) {
  const pinFallbackVisible = !isSetupMode;

  if (isSetupMode || !enrolled) {
    return {
      showUnlockButton: false,
      unavailableMessage: null,
      pinFallbackVisible,
    };
  }

  if (passkeySupported === true) {
    return {
      showUnlockButton: true,
      unavailableMessage: null,
      pinFallbackVisible,
    };
  }

  if (passkeySupported === false) {
    return {
      showUnlockButton: false,
      unavailableMessage: PASSKEY_UNLOCK_UNAVAILABLE_MESSAGE,
      pinFallbackVisible,
    };
  }

  return {
    showUnlockButton: false,
    unavailableMessage: null,
    pinFallbackVisible,
  };
}

export function getPasskeyUnsupportedSectionCopy() {
  return {
    headline: PASSKEY_UNSUPPORTED_HEADLINE,
    lead: PASSKEY_UNSUPPORTED_LEAD,
    pinRecovery: PASSKEY_UNSUPPORTED_PIN_RECOVERY,
    recommendations: PASSKEY_UNSUPPORTED_RECOMMENDATIONS,
    inAppWarning: PASSKEY_UNSUPPORTED_IN_APP_WARNING,
    whySummary: PASSKEY_WHY_SUMMARY,
    whyDetails: PASSKEY_WHY_DETAILS,
  };
}

export function mapPasskeyEnrollmentError(error) {
  if (!error) {
    return "Unable to enroll passkey.";
  }

  if (error.name === "NotAllowedError" || error.name === "AbortError") {
    return "Passkey enrollment was cancelled.";
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/requires WebAuthn PRF support/i.test(message)) {
    return PASSKEY_UNSUPPORTED_LEAD;
  }

  if (/WebAuthn credential creation is unavailable/i.test(message)) {
    return "Passkey creation is unavailable in this browser.";
  }

  if (/Unable to resolve passkey rpId/i.test(message)) {
    return "Passkey enrollment is unavailable on this site origin.";
  }

  if (/Unlock the vault/i.test(message)) {
    return message;
  }

  return message || "Unable to enroll passkey.";
}
