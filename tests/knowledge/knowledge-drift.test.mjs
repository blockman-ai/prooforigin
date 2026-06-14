import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditLegacyHelpInventory,
  getKnowledgeReadinessReport,
  getStaleArticleWarnings,
  KNOWLEDGE_STALE_AFTER_DAYS,
  validateCorpusVersion,
  validateKnowledgeDrift,
  validateLastReviewedDate,
} from "../../app/lib/knowledgeDrift.js";
import {
  loadKnowledgeManifest,
  resetKnowledgeManifestCacheForTests,
  resolveGuideTopic,
} from "../../app/lib/knowledgeIndex.js";

test("validateCorpusVersion accepts YYYY.MM.N format", () => {
  assert.doesNotThrow(() => validateCorpusVersion("2026.06.5"));
  assert.throws(() => validateCorpusVersion("2026-06-04"), /YYYY\.MM\.N/);
  assert.throws(() => validateCorpusVersion("v1"), /YYYY\.MM\.N/);
});

test("validateLastReviewedDate accepts ISO dates", () => {
  assert.equal(validateLastReviewedDate("2026-06-14", "demo"), "2026-06-14");
  assert.throws(() => validateLastReviewedDate("06/14/2026", "demo"), /YYYY-MM-DD/);
});

test("validateKnowledgeDrift passes for current manifest", () => {
  resetKnowledgeManifestCacheForTests();
  const manifest = loadKnowledgeManifest();
  assert.doesNotThrow(() => validateKnowledgeDrift(manifest));
});

test("validateKnowledgeDrift rejects unknown related article", () => {
  const manifest = loadKnowledgeManifest();
  const broken = structuredClone(manifest);
  broken.articles[0].related = ["missing-topic"];

  assert.throws(
    () => validateKnowledgeDrift(broken),
    /references unknown id: missing-topic/
  );
});

test("validateKnowledgeDrift rejects unknown topic_resolution mapping", () => {
  const manifest = loadKnowledgeManifest();
  const broken = structuredClone(manifest);
  broken.topic_resolution.by_feature.passkey = "missing-passkey-topic";

  assert.throws(
    () => validateKnowledgeDrift(broken),
    /topic_resolution\.by_feature\.passkey references unknown article/
  );
});

test("validateKnowledgeDrift rejects invalid guide route mapping", () => {
  const manifest = loadKnowledgeManifest();
  const broken = structuredClone(manifest);
  broken.articles.find((article) => article.id === "vault-overview").routes = ["vault"];

  assert.throws(
    () => validateKnowledgeDrift(broken),
    /must be an app route starting with "\/"/
  );
});

test("getStaleArticleWarnings is empty for freshly reviewed corpus", () => {
  resetKnowledgeManifestCacheForTests();
  const manifest = loadKnowledgeManifest();
  const warnings = getStaleArticleWarnings(manifest, {
    now: new Date("2026-06-14T12:00:00.000Z"),
    staleAfterDays: KNOWLEDGE_STALE_AFTER_DAYS,
  });

  assert.deepEqual(warnings, []);
});

test("getStaleArticleWarnings flags stale articles", () => {
  const manifest = loadKnowledgeManifest();
  const warnings = getStaleArticleWarnings(manifest, {
    now: new Date("2026-12-01T00:00:00.000Z"),
    staleAfterDays: 30,
  });

  assert.ok(warnings.length > 0);
  assert.equal(warnings[0].code, "stale_article");
});

test("auditLegacyHelpInventory is empty after V1 finalization", () => {
  resetKnowledgeManifestCacheForTests();
  const manifest = loadKnowledgeManifest();
  const inventory = auditLegacyHelpInventory(manifest);

  assert.deepEqual(inventory, []);
});

test("getKnowledgeReadinessReport scores finalized V1 corpus", () => {
  resetKnowledgeManifestCacheForTests();
  const manifest = loadKnowledgeManifest();
  const report = getKnowledgeReadinessReport(manifest);

  assert.equal(report.corpus_version, "2026.06.5");
  assert.equal(report.article_count, 16);
  assert.equal(report.stale_warning_count, 0);
  assert.equal(report.legacy_help_pending, 0);
  assert.equal(report.legacy_help_count, 0);
  assert.equal(report.score, 100);
  assert.equal(report.v1_complete, true);
});

test("restore routing polish resolves common recovery phrases", () => {
  assert.equal(resolveGuideTopic("How do I restore my vault?"), "restore-vault");
  assert.equal(resolveGuideTopic("How do I recover my vault?"), "restore-vault");
  assert.equal(resolveGuideTopic("new device restore"), "restore-vault");
  assert.equal(
    resolveGuideTopic("How do I restore my vault?", { feature: "general" }),
    "restore-vault"
  );
});
