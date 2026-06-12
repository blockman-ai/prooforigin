export function buildVaultGuideSafeContext({
  route = "/vault",
  vaultLocked = false,
  mvkMode = false,
  pinConfigured = false,
  passkeyEnrolled = false,
  passkeySupported = null,
  recoveryConfigured = false,
  protectedViewActive = false,
} = {}) {
  const context = {
    route,
    feature: "vault",
    vault: {
      locked: Boolean(vaultLocked),
      mvkMode: Boolean(mvkMode),
      pinConfigured: Boolean(pinConfigured),
      passkeyEnrolled: Boolean(passkeyEnrolled),
      recoveryConfigured: Boolean(recoveryConfigured),
    },
    protectedView: {
      active: Boolean(protectedViewActive),
    },
    app: {
      betaDisclaimer: true,
    },
  };

  if (passkeySupported === null || passkeySupported === undefined) {
    context.vault.passkeySupported = null;
  } else {
    context.vault.passkeySupported = Boolean(passkeySupported);
  }

  return context;
}

export const GUIDE_VAULT_SUGGESTIONS = [
  { label: "How do I unlock?", question: "How do I unlock?" },
  { label: "Why doesn't passkey work?", question: "Why doesn't passkey work?" },
  { label: "What is a Recovery Kit?", question: "What is a Recovery Kit?" },
  { label: "What is Protected View?", question: "What is Protected View?" },
];
