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
  assert.equal(getGuideArticles(manifest).length, 6);
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

  assert.equal(Object.keys(topics).length, 6);
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

test("every guide article tracks a legacy help source file", () => {
  const manifest = loadKnowledgeManifest();

  for (const article of getGuideArticles(manifest)) {
    assert.ok(article.source_of_truth, `${article.id} missing source_of_truth`);
    const legacyPath = path.join(process.cwd(), article.source_of_truth);
    assert.ok(fs.existsSync(legacyPath), `${article.id} legacy source missing`);
  }
});
