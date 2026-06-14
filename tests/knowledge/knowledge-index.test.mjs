import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  buildGuideHelpTopicsMap,
  getGuideArticles,
  getKnowledgeCorpusVersion,
  loadKnowledgeManifest,
  resetKnowledgeManifestCacheForTests,
  resolveGuideTopic,
  validateKnowledgeManifest,
} from "../../app/lib/knowledgeIndex.js";

test("knowledge manifest loads and validates", () => {
  resetKnowledgeManifestCacheForTests();
  const manifest = loadKnowledgeManifest();
  assert.equal(manifest.schema_version, 1);
  assert.ok(manifest.corpus_version);
  assert.equal(getGuideArticles(manifest).length, 10);
  assert.equal(getKnowledgeCorpusVersion(manifest), manifest.corpus_version);
});

test("knowledge manifest article ids are unique and files exist", () => {
  const manifest = loadKnowledgeManifest();
  const ids = new Set();

  for (const article of manifest.articles) {
    assert.ok(!ids.has(article.id), `duplicate id ${article.id}`);
    ids.add(article.id);
    assert.ok(article.audience.includes("guide"));
    assert.equal(article.status, "active");
  }
});

test("buildGuideHelpTopicsMap mirrors manifest guide topics", () => {
  const manifest = loadKnowledgeManifest();
  const topics = buildGuideHelpTopicsMap(manifest);

  assert.equal(Object.keys(topics).length, 10);
  assert.equal(topics["vault-overview"].title, "Your Private Vault");
  assert.ok(Array.isArray(topics.passkey.keywords));
  assert.equal(topics.passkey.keywords.some((pattern) => pattern.test("passkey")), true);
});

test("resolveGuideTopic matches legacy guide topic routing", () => {
  assert.equal(resolveGuideTopic("How do I unlock?"), "vault-unlock");
  assert.equal(resolveGuideTopic("Why doesn't passkey work?"), "passkey");
  assert.equal(resolveGuideTopic("What is a Recovery Kit?"), "recovery-kit");
  assert.equal(resolveGuideTopic("How do I restore on a new device?"), "restore-vault");
  assert.equal(resolveGuideTopic("What does Voice documented mean?"), "trust-pass-voice");
  assert.equal(resolveGuideTopic("What is Protected View?"), "vault-overview");
});

test("resolveGuideTopic honors context fallbacks", () => {
  assert.equal(resolveGuideTopic("general help", { feature: "passkey" }), "passkey");
  assert.equal(resolveGuideTopic("general help", { feature: "recovery" }), "restore-vault");
  assert.equal(resolveGuideTopic("general help", { protectedView: { active: true } }), "vault-overview");
  assert.equal(resolveGuideTopic("general help", { vault: { locked: true } }), "vault-unlock");
  assert.equal(resolveGuideTopic("unknown question"), "vault-overview");
});

test("validateKnowledgeManifest rejects invalid schema", () => {
  assert.throws(
    () => validateKnowledgeManifest({ schema_version: 2, corpus_version: "x", articles: [] }),
    /Unsupported knowledge manifest schema_version/
  );
});

test("resolveGuideTopic maps phase 1 guide expansion questions", () => {
  assert.equal(resolveGuideTopic("What is ProofOrigin?"), "platform-overview");
  assert.equal(
    resolveGuideTopic("What is the difference between Vault and Trust Pass?"),
    "platform-overview"
  );
  assert.equal(resolveGuideTopic("Does ProofOrigin prove absolute truth?"), "product-boundaries");
  assert.equal(resolveGuideTopic("How does ProofOrigin protect privacy?"), "product-boundaries");
  assert.equal(resolveGuideTopic("What is a ProofOrigin Trust Pass?"), "trust-pass-overview");
  assert.equal(resolveGuideTopic("How does the Live Trust Code work?"), "trust-pass-overview");
  assert.equal(resolveGuideTopic("What is Voice Anchor?"), "voice-anchor-overview");
  assert.equal(
    resolveGuideTopic("How is Voice Anchor enrollment stored?"),
    "voice-anchor-overview"
  );
});

test("resolveGuideTopic honors feature fallbacks for phase 1 topics", () => {
  assert.equal(resolveGuideTopic("general help", { feature: "trust_pass" }), "trust-pass-overview");
  assert.equal(resolveGuideTopic("general help", { feature: "voice_anchor" }), "voice-anchor-overview");
  assert.equal(resolveGuideTopic("general help", { feature: "general" }), "platform-overview");
});

test("every guide article tracks an existing source_of_truth file", () => {
  const manifest = loadKnowledgeManifest();

  for (const article of getGuideArticles(manifest)) {
    assert.ok(article.source_of_truth, `${article.id} missing source_of_truth`);
    const sourcePath = path.join(process.cwd(), article.source_of_truth);
    assert.ok(fs.existsSync(sourcePath), `${article.id} source missing at ${article.source_of_truth}`);
  }
});
