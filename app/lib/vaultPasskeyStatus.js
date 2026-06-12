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

export function isPasskeyUnlockButtonVisible({ isSetupMode, enrolled }) {
  return !isSetupMode && Boolean(enrolled);
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
    return "This device or browser does not support vault passkeys. Continue using your PIN.";
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
