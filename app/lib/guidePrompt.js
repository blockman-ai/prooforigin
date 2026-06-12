import { GUIDE_FORBIDDEN_CONTEXT_KEYS } from "./guideSchema.js";

export const GUIDE_DISCLAIMER =
  "I cannot see your vault contents, PIN, recovery phrase, documents, or trust secrets.";

export const GUIDE_SYSTEM_INSTRUCTIONS = [
  "You are ProofOrigin Guide.",
  "Explain ProofOrigin features using only approved help snippets.",
  "Never request or accept secrets.",
  GUIDE_DISCLAIMER,
].join(" ");

function markdownToPlainSteps(body) {
  const lines = String(body)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parts = [];
  let paragraph = [];

  for (const line of lines) {
    if (line.startsWith("#")) {
      if (paragraph.length > 0) {
        parts.push(paragraph.join(" "));
        paragraph = [];
      }
      parts.push(line.replace(/^#+\s*/, "").trim());
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      if (paragraph.length > 0) {
        parts.push(paragraph.join(" "));
        paragraph = [];
      }
      parts.push(line);
      continue;
    }

    if (line.startsWith("- ")) {
      if (paragraph.length > 0) {
        parts.push(paragraph.join(" "));
        paragraph = [];
      }
      parts.push(line);
      continue;
    }

    paragraph.push(line);
  }

  if (paragraph.length > 0) {
    parts.push(paragraph.join(" "));
  }

  return parts.join("\n\n");
}

export function sanitizeGuideContextForPrompt(context = {}) {
  return JSON.parse(JSON.stringify(context));
}

export function buildGuidePromptPayload({ question, context, snippet }) {
  return {
    mode: "deterministic",
    system: GUIDE_SYSTEM_INSTRUCTIONS,
    snippets: [
      {
        id: snippet.id,
        title: snippet.title,
      },
    ],
    context: sanitizeGuideContextForPrompt(context),
    question,
  };
}

function buildContextNotes(context = {}) {
  const notes = [];

  if (context.vault?.passkeySupported === false) {
    notes.push("Secure passkey encryption is unavailable in this browser. Recommend PIN fallback.");
  }

  if (context.vault?.passkeyEnrolled && context.vault?.passkeySupported === false) {
    notes.push("A passkey is enrolled, but this browser cannot use it for vault unlock.");
  }

  if (context.vault?.recoveryConfigured === false) {
    notes.push("No Recovery Kit is marked as saved on this device.");
  }

  if (context.protectedView?.active) {
    notes.push("Protected View is active. Focus on view-only and watermark guidance.");
  }

  return notes;
}

export function buildDeterministicGuideAnswer({ question, context, snippet }) {
  const prompt = buildGuidePromptPayload({ question, context, snippet });
  const notes = buildContextNotes(context);
  const body = markdownToPlainSteps(snippet.body);

  const sections = [`**${snippet.title}**`, body];

  if (notes.length > 0) {
    sections.push(notes.map((note) => `- ${note}`).join("\n"));
  }

  return {
    answer: sections.join("\n\n"),
    disclaimer: GUIDE_DISCLAIMER,
    topic: snippet.id,
    suggestedFollowUps: prompt.snippets.map((entry) => entry.title),
    prompt,
  };
}

export function promptContainsForbiddenTerms(promptPayload) {
  const serialized = JSON.stringify(promptPayload).toLowerCase();

  for (const key of GUIDE_FORBIDDEN_CONTEXT_KEYS) {
    const pattern = new RegExp(`"${key}"\\s*:`, "i");
    if (pattern.test(serialized)) {
      return true;
    }
  }

  return false;
}
