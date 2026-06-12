export const GUIDE_OUTPUT_REFUSAL =
  "I can't provide that answer safely. Use your PIN or Recovery Kit as documented, and never share secrets here.";

const KEY_LIKE_HEX_PATTERN = /\b[0-9a-f]{64}\b/i;
const OPENAI_KEY_PATTERN = /\bsk-[a-zA-Z0-9]{10,}\b/;
const RECOVERY_PHRASE_LEAK_PATTERN =
  /\b(?:here is|your|the) (?:recovery phrase|seed phrase|mnemonic)(?: is|:)\b/i;
const SECRET_DISCLOSURE_PATTERN =
  /\b(?:your|the) (?:pin|master vault key|mvk|trust pass seed|secret seed)(?: is|:)\b/i;
const UNSAFE_RECOVERY_PATTERN =
  /\b(?:prooforigin|support staff|our team).{0,30}(?:unlock|reset|recover) (?:your )?(?:vault|pin)\b/i;
const SECRET_REQUEST_PATTERN =
  /(?<!(?:never|don't|don’t|not|do not) )(?:paste|send|share|upload).{0,30}(?:recovery phrase|pin|master vault key|secret seed)\b/i;

export function analyzeGuideOutputSafety(text) {
  const value = String(text || "").trim();
  const reasons = [];

  if (!value) {
    reasons.push("empty_output");
    return { safe: false, reasons };
  }

  if (KEY_LIKE_HEX_PATTERN.test(value)) {
    reasons.push("key_like_string");
  }

  if (OPENAI_KEY_PATTERN.test(value)) {
    reasons.push("api_key_like_string");
  }

  if (RECOVERY_PHRASE_LEAK_PATTERN.test(value)) {
    reasons.push("recovery_phrase_disclosure");
  }

  if (SECRET_DISCLOSURE_PATTERN.test(value)) {
    reasons.push("secret_disclosure");
  }

  if (UNSAFE_RECOVERY_PATTERN.test(value)) {
    reasons.push("unsafe_recovery_instruction");
  }

  if (SECRET_REQUEST_PATTERN.test(value)) {
    reasons.push("secret_request");
  }

  return {
    safe: reasons.length === 0,
    reasons,
  };
}

export function filterGuideModelOutput(text) {
  const analysis = analyzeGuideOutputSafety(text);

  if (!analysis.safe) {
    return {
      ok: false,
      text: null,
      reasons: analysis.reasons,
    };
  }

  return {
    ok: true,
    text: String(text).trim(),
    reasons: [],
  };
}
