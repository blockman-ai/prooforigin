import crypto from "crypto";

export const VOICE_ANCHOR_VERSION = "v1";
export const VOICE_ANCHOR_MAX_BYTES = 10 * 1024 * 1024;
export const VOICE_ANCHOR_STORAGE_KEY = "prooforigin_voice_anchor_v1";

const FINGERPRINT_PREFIX = "prooforigin-voice-anchor-v1";

export function generateEnrollmentToken() {
  return crypto.randomUUID();
}

export function hashEnrollmentToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/**
 * Placeholder voice fingerprint — derived hash only, not a biometric model.
 */
export function buildVoiceFingerprintHash(buffer, { mimeType, byteSize, durationMs }) {
  const contentSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const metaParts = [
    FINGERPRINT_PREFIX,
    contentSha256,
    mimeType || "unknown",
    String(byteSize ?? buffer.length),
    durationMs != null ? String(durationMs) : "",
  ];
  const fingerprintHash = crypto
    .createHash("sha256")
    .update(metaParts.join("|"))
    .digest("hex");

  return { fingerprintHash, contentSha256 };
}

export function fingerprintPreview(hash, head = 12, tail = 8) {
  if (!hash || hash.length <= head + tail + 3) return hash || "";
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function isAllowedVoiceMime(mimeType) {
  if (!mimeType) return false;
  if (mimeType.startsWith("audio/")) return true;
  return mimeType === "video/webm";
}

export function emailLooksValid(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function readStoredEnrollment() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VOICE_ANCHOR_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeStoredEnrollment(record) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VOICE_ANCHOR_STORAGE_KEY, JSON.stringify(record));
}

export function clearStoredEnrollment() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(VOICE_ANCHOR_STORAGE_KEY);
}
