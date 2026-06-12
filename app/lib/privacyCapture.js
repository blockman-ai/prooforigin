export const PRIVACY_CAPTURE_DISCLAIMER =
  "ProofOrigin can deter screenshots, but your device or operating system may still capture the screen. Always verify live status.";

export const PRIVACY_OVERLAY_MESSAGE = "Protected screen — return to continue";

export const TRUST_PASS_WATERMARK =
  "ProofOrigin Live Credential — screenshots may be outdated";

export const VAULT_WATERMARK = "ProofOrigin Vault — protected content";

export function shouldObscurePrivacyScreen({ visibilityState, hasFocus, strict = false }) {
  const hidden = visibilityState === "hidden";
  const blurred = !hasFocus;
  return strict ? hidden || blurred : hidden;
}
