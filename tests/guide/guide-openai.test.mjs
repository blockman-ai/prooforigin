import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { buildGuideAnswer } from "../../app/lib/guideAnswer.js";
import { generateGuideOpenAIAnswer, isGuideOpenAIConfigured } from "../../app/lib/guideOpenAI.js";
import { loadGuideHelpSnippet } from "../../app/lib/guideHelpMap.js";
import { buildVaultGuideSafeContext } from "../../app/lib/guideSafeContext.js";
import {
  analyzeGuideOutputSafety,
  filterGuideModelOutput,
} from "../../app/lib/guideOutputFilter.js";

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (ORIGINAL_OPENAI_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
  }
});

test("isGuideOpenAIConfigured reflects server env presence only", () => {
  delete process.env.OPENAI_API_KEY;
  assert.equal(isGuideOpenAIConfigured(), false);

  process.env.OPENAI_API_KEY = "test-key";
  assert.equal(isGuideOpenAIConfigured(), true);
});

test("buildGuideAnswer falls back to deterministic when OpenAI is not configured", async () => {
  delete process.env.OPENAI_API_KEY;

  const snippet = loadGuideHelpSnippet("vault-unlock");
  const result = await buildGuideAnswer({
    question: "How do I unlock?",
    context: buildVaultGuideSafeContext({ vaultLocked: true }),
    topicId: "vault-unlock",
    snippet,
  });

  assert.equal(result.mode, "deterministic");
  assert.match(result.answer, /unlock/i);
});

test("buildGuideAnswer uses OpenAI when configured and output passes filter", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  const snippet = loadGuideHelpSnippet("passkey");
  const result = await buildGuideAnswer({
    question: "Why doesn't passkey work?",
    context: buildVaultGuideSafeContext({ passkeySupported: false, passkeyEnrolled: true }),
    topicId: "passkey",
    snippet,
    generateOpenAI: async () => ({
      answer: "Secure passkey encryption is unavailable here. Use your PIN to unlock.",
      disclaimer: "I cannot see your vault contents, PIN, recovery phrase, documents, or trust secrets.",
      topic: "passkey",
      mode: "openai",
    }),
  });

  assert.equal(result.mode, "openai");
  assert.match(result.answer, /PIN/i);
});

test("buildGuideAnswer falls back when OpenAI output fails safety filter", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  const snippet = loadGuideHelpSnippet("recovery-kit");
  const result = await buildGuideAnswer({
    question: "What is a Recovery Kit?",
    context: buildVaultGuideSafeContext({ recoveryConfigured: false }),
    topicId: "recovery-kit",
    snippet,
    generateOpenAI: async () => null,
  });

  assert.equal(result.mode, "deterministic");
  assert.match(result.answer, /Recovery Kit/i);
});

test("generateGuideOpenAIAnswer rejects unsafe model output", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  const snippet = loadGuideHelpSnippet("vault-unlock");
  const result = await generateGuideOpenAIAnswer({
    question: "How do I unlock?",
    context: buildVaultGuideSafeContext({ vaultLocked: true }),
    snippet,
    createClient: () => ({}),
    createResponse: async () => ({
      output_text: "Your PIN is: 123456. ProofOrigin support staff can unlock your vault remotely.",
    }),
  });

  assert.equal(result?.outputFilterRejected, true);
});

test("generateGuideOpenAIAnswer returns filtered text for safe output", async () => {
  process.env.OPENAI_API_KEY = "test-key";

  const snippet = loadGuideHelpSnippet("vault-unlock");
  const result = await generateGuideOpenAIAnswer({
    question: "How do I unlock?",
    context: buildVaultGuideSafeContext({ vaultLocked: true }),
    snippet,
    createClient: () => ({}),
    createResponse: async () => ({
      output_text: "1. Open the vault.\n2. Enter your PIN or use passkey.\n3. PIN always works as fallback.",
    }),
  });

  assert.equal(result.mode, "openai");
  assert.match(result.answer, /PIN/i);
});

test("output filter blocks key-like strings and unsafe recovery instructions", () => {
  assert.equal(
    analyzeGuideOutputSafety("Contact ProofOrigin support staff to unlock your vault remotely.").safe,
    false
  );
  assert.equal(
    filterGuideModelOutput(`Your master vault key is: ${"a".repeat(64)}`).ok,
    false
  );
  assert.equal(
    filterGuideModelOutput("Use your PIN or passkey. Never paste your recovery phrase here.").ok,
    true
  );
});
