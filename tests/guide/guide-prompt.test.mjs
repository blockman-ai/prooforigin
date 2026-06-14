import assert from "node:assert/strict";
import { test } from "node:test";
import { loadGuideHelpSnippet, resolveGuideTopic } from "../../app/lib/guideHelpMap.js";
import {
  buildDeterministicGuideAnswer,
  buildGuideOpenAIPromptBundle,
  buildGuidePromptPayload,
  buildOpenAIGuideRequest,
  promptContainsForbiddenTerms,
} from "../../app/lib/guidePrompt.js";
import { buildVaultGuideSafeContext } from "../../app/lib/guideSafeContext.js";

test("resolveGuideTopic maps common vault questions to help snippets", () => {
  assert.equal(resolveGuideTopic("How do I unlock?"), "vault-unlock");
  assert.equal(resolveGuideTopic("Why doesn't passkey work?"), "passkey");
  assert.equal(resolveGuideTopic("What is a Recovery Kit?"), "recovery-kit");
  assert.equal(resolveGuideTopic("How do I restore on a new device?"), "restore-vault");
  assert.equal(resolveGuideTopic("What does Voice documented mean?"), "trust-pass-voice");
  assert.equal(resolveGuideTopic("What is Protected View?"), "vault-overview");
});

test("deterministic answer includes snippet title and no secret placeholders", () => {
  const context = buildVaultGuideSafeContext({
    vaultLocked: true,
    passkeySupported: false,
    passkeyEnrolled: true,
  });
  const snippet = loadGuideHelpSnippet("passkey");
  const result = buildDeterministicGuideAnswer({
    question: "Why doesn't passkey work?",
    context,
    snippet,
  });

  assert.match(result.answer, /Vault passkeys/i);
  assert.match(result.answer, /Secure passkey encryption is unavailable/i);
  assert.doesNotMatch(result.answer, /masterVaultKey/i);
  assert.doesNotMatch(result.answer, /recovery phrase:/i);
});

test("prompt payload contains only safe context and help metadata", () => {
  const context = buildVaultGuideSafeContext({ vaultLocked: true });
  const snippet = loadGuideHelpSnippet("vault-unlock");
  const prompt = buildGuidePromptPayload({
    question: "How do I unlock?",
    context,
    snippet,
  });

  assert.equal(prompt.mode, "deterministic");
  assert.equal(prompt.snippets[0].id, "vault-unlock");
  assert.equal(promptContainsForbiddenTerms(prompt), false);

  const serialized = JSON.stringify(prompt);
  assert.doesNotMatch(serialized, /"pin"\s*:/i);
  assert.doesNotMatch(serialized, /"masterVaultKey"\s*:/i);
  assert.doesNotMatch(serialized, /"recoveryPhrase"\s*:/i);
});

test("forbidden secret keys in prompt fixture are detected", () => {
  const prompt = {
    mode: "deterministic",
    context: {
      vault: {
        locked: true,
        pin: "123456",
      },
    },
  };

  assert.equal(promptContainsForbiddenTerms(prompt), true);
});

test("OpenAI prompt bundle includes snippet body and safe context only", () => {
  const context = buildVaultGuideSafeContext({
    vaultLocked: true,
    passkeySupported: false,
    passkeyEnrolled: true,
  });
  const snippet = loadGuideHelpSnippet("passkey");
  const bundle = buildGuideOpenAIPromptBundle({
    question: "Why doesn't passkey work?",
    context,
    snippet,
  });

  assert.equal(bundle.mode, "openai");
  assert.ok(bundle.snippets[0].body);
  assert.equal(promptContainsForbiddenTerms(bundle), false);

  const request = buildOpenAIGuideRequest(bundle);
  const serialized = JSON.stringify(request);
  assert.match(serialized, /Approved Help Snippet/i);
  assert.match(serialized, /passkeySupported.*false/);
  assert.doesNotMatch(serialized, /"masterVaultKey"\s*:/i);
  assert.doesNotMatch(serialized, /"recoveryPhrase"\s*:/i);
});
