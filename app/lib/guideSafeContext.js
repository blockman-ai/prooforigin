export function resolveGuideFeatureFromRoute(pathname = "/") {
  const path = String(pathname || "/").split("?")[0].split("#")[0] || "/";

  if (path === "/vault" || path.startsWith("/vault/")) {
    return "vault";
  }

  if (path === "/identity-card" || path.startsWith("/identity-card/")) {
    return "trust_pass";
  }

  if (path === "/id" || path.startsWith("/id/")) {
    return "trust_pass";
  }

  if (path === "/voice-anchor" || path.startsWith("/voice-anchor/")) {
    return "voice_anchor";
  }

  if (
    path === "/detect" ||
    path.startsWith("/detect/") ||
    path === "/upload" ||
    path.startsWith("/upload/")
  ) {
    return "provenance";
  }

  return "general";
}

export function buildGenericGuideSafeContext({ route = "/", feature = "general" } = {}) {
  return {
    route: String(route || "/").split("?")[0].split("#")[0] || "/",
    feature,
    app: {
      betaDisclaimer: true,
    },
  };
}

export function buildRouteGuideSafeContext(pathname = "/") {
  const route = String(pathname || "/").split("?")[0].split("#")[0] || "/";
  return buildGenericGuideSafeContext({
    route,
    feature: resolveGuideFeatureFromRoute(route),
  });
}

export function getGuideTitleForFeature(feature = "general") {
  switch (feature) {
    case "vault":
      return "Vault help";
    case "trust_pass":
      return "Trust Pass help";
    case "voice_anchor":
      return "Voice Anchor help";
    case "provenance":
      return "Provenance help";
    default:
      return "ProofOrigin help";
  }
}

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

export const GUIDE_TRUST_PASS_SUGGESTIONS = [
  { label: "What is a Trust Pass?", question: "What is a ProofOrigin Trust Pass?" },
  { label: "How does live code work?", question: "How does the Live Trust Code work?" },
  { label: "How do I verify someone?", question: "How do I verify a Trust Pass live code?" },
];

export const GUIDE_VOICE_ANCHOR_SUGGESTIONS = [
  { label: "What is Voice Anchor?", question: "What is Voice Anchor?" },
  { label: "How is audio stored?", question: "How is Voice Anchor enrollment stored?" },
];

export const GUIDE_PROVENANCE_SUGGESTIONS = [
  { label: "What is provenance?", question: "What does ProofOrigin provenance checking do?" },
  { label: "Is this absolute proof?", question: "Does ProofOrigin prove absolute truth?" },
];

export const GUIDE_GENERAL_SUGGESTIONS = [
  { label: "What is ProofOrigin?", question: "What is ProofOrigin?" },
  { label: "Vault vs Trust Pass?", question: "What is the difference between Vault and Trust Pass?" },
  { label: "Is my data private?", question: "How does ProofOrigin protect privacy?" },
];

export function getGuideSuggestionsForFeature(feature = "general") {
  switch (feature) {
    case "vault":
      return GUIDE_VAULT_SUGGESTIONS;
    case "trust_pass":
      return GUIDE_TRUST_PASS_SUGGESTIONS;
    case "voice_anchor":
      return GUIDE_VOICE_ANCHOR_SUGGESTIONS;
    case "provenance":
      return GUIDE_PROVENANCE_SUGGESTIONS;
    default:
      return GUIDE_GENERAL_SUGGESTIONS;
  }
}
