import fs from "node:fs";
import path from "node:path";

export const GUIDE_HELP_TOPICS = {
  "vault-overview": {
    id: "vault-overview",
    title: "Your Private Vault",
    file: "vault-overview.md",
    keywords: [/protected view/i, /watermark/i, /what is the vault/i, /overview/i],
  },
  "vault-unlock": {
    id: "vault-unlock",
    title: "Unlocking your vault",
    file: "vault-unlock.md",
    keywords: [/unlock/i, /\bpin\b/i, /lock/i, /vanish/i, /how do i open/i],
  },
  passkey: {
    id: "passkey",
    title: "Vault passkeys",
    file: "passkey.md",
    keywords: [/passkey/i, /face id/i, /touch id/i, /windows hello/i, /webauthn/i, /biometric/i],
  },
  "recovery-kit": {
    id: "recovery-kit",
    title: "Recovery Kit",
    file: "recovery-kit.md",
    keywords: [/recovery kit/i, /recovery phrase/i, /lose my device/i, /lockout/i, /forgot/i],
  },
  "restore-vault": {
    id: "restore-vault",
    title: "Restore vault on a new device",
    file: "restore-vault.md",
    keywords: [
      /restore vault/i,
      /restore from recovery/i,
      /new device/i,
      /import recovery/i,
      /recovery import/i,
      /\/vault\/restore/i,
    ],
  },
  "trust-pass-voice": {
    id: "trust-pass-voice",
    title: "Trust Pass + Voice Anchor",
    file: "trust-pass-voice.md",
    keywords: [
      /voice documented/i,
      /link voice/i,
      /voice anchor/i,
      /trust pass voice/i,
      /voice enrollment/i,
    ],
  },
};

export const GUIDE_SUGGESTED_QUESTIONS = [
  { label: "How do I unlock?", question: "How do I unlock?" },
  { label: "Why doesn't passkey work?", question: "Why doesn't passkey work?" },
  { label: "What is a Recovery Kit?", question: "What is a Recovery Kit?" },
  { label: "How do I restore on a new device?", question: "How do I restore on a new device?" },
  { label: "What does Voice documented mean?", question: "What does Voice documented mean?" },
  { label: "What is Protected View?", question: "What is Protected View?" },
];

const HELP_DIR = path.join(process.cwd(), "docs", "help");

export function resolveGuideTopic(question, context = {}) {
  const normalized = String(question || "").trim().toLowerCase();

  for (const topic of Object.values(GUIDE_HELP_TOPICS)) {
    if (topic.keywords.some((pattern) => pattern.test(normalized))) {
      return topic.id;
    }
  }

  if (context.feature === "passkey") {
    return "passkey";
  }

  if (context.feature === "recovery") {
    return "restore-vault";
  }

  if (context.protectedView?.active) {
    return "vault-overview";
  }

  if (context.vault?.locked) {
    return "vault-unlock";
  }

  return "vault-overview";
}

export function loadGuideHelpSnippet(topicId) {
  const topic = GUIDE_HELP_TOPICS[topicId] || GUIDE_HELP_TOPICS["vault-overview"];
  const filePath = path.join(HELP_DIR, topic.file);
  const body = fs.readFileSync(filePath, "utf8");

  return {
    id: topic.id,
    title: topic.title,
    body,
  };
}

export function getGuideSuggestedFollowUps(topicId) {
  return GUIDE_SUGGESTED_QUESTIONS.filter((entry) => {
    const resolved = resolveGuideTopic(entry.question);
    return resolved !== topicId;
  })
    .slice(0, 3)
    .map((entry) => entry.question);
}
