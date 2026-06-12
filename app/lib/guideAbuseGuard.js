export const GUIDE_ABUSE_REFUSAL =
  "I can't help with that request. ProofOrigin Guide never accepts PINs, recovery phrases, keys, document uploads, or secret values.";

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /disregard (the )?(system|developer) (prompt|message|instructions)/i,
  /you are now/i,
  /act as (a )?(system|developer|admin)/i,
  /reveal (the )?(system|hidden|developer) prompt/i,
  /what is your system prompt/i,
];

const SECRET_REQUEST_PATTERNS = [
  /paste (my )?(pin|recovery phrase|seed|master vault key|mvk)/i,
  /here is my (pin|recovery phrase|seed|passphrase)/i,
  /decrypt (my )?(vault|document|file)/i,
  /upload (my )?(document|file|vault)/i,
  /send (me )?(the )?(service role|api key|openai|dts master)/i,
  /read (my )?localstorage/i,
  /export (my )?(recovery kit|vault key|master key)/i,
  /\b\d+\s+(?:words?|word seed)\b.*\b(?:recovery|phrase|mnemonic)\b/i,
];

export function classifyGuideAbuse(question) {
  if (typeof question !== "string" || !question.trim()) {
    return { blocked: true, reason: "empty_question" };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(question)) {
      return { blocked: true, reason: "prompt_injection" };
    }
  }

  for (const pattern of SECRET_REQUEST_PATTERNS) {
    if (pattern.test(question)) {
      return { blocked: true, reason: "secret_request" };
    }
  }

  return { blocked: false, reason: null };
}

export function isGuideQuestionBlocked(question) {
  return classifyGuideAbuse(question).blocked;
}
