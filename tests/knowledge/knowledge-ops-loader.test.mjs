import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractRunbookSection,
  loadOpsRunbookExcerpt,
  OPS_RUNBOOK_EXCERPT_MAX_CHARS,
  parseKnowledgeRef,
  slugifyRunbookSection,
  splitRunbookSections,
  truncateRunbookExcerpt,
} from "../../app/lib/knowledgeOpsLoader.js";
import { resetKnowledgeManifestCacheForTests } from "../../app/lib/knowledgeIndex.js";

const FORBIDDEN_EXCERPT_FRAGMENTS = [
  /service_role/i,
  /PROOFORIGIN_OPS_SECRET/i,
  /\bpin\b/i,
  /recovery phrase/i,
  /-----BEGIN/i,
];

test("slugifyRunbookSection normalizes headings", () => {
  assert.equal(slugifyRunbookSection("Orphan reconciliation"), "orphan-reconciliation");
  assert.equal(slugifyRunbookSection("Guide secret requests"), "guide-secret-requests");
});

test("parseKnowledgeRef requires article and anchor", () => {
  assert.deepEqual(parseKnowledgeRef("ops/storage-audit#orphan-reconciliation"), {
    articleId: "ops/storage-audit",
    anchor: "#orphan-reconciliation",
  });

  assert.throws(() => parseKnowledgeRef("ops/storage-audit"), /section-anchor/);
});

test("loadOpsRunbookExcerpt returns section excerpt for mapped rule", () => {
  resetKnowledgeManifestCacheForTests();
  const result = loadOpsRunbookExcerpt("ops/storage-audit#orphan-reconciliation");

  assert.equal(result.article_id, "ops/storage-audit");
  assert.equal(result.anchor, "#orphan-reconciliation");
  assert.match(result.excerpt, /Orphan reconciliation/);
  assert.match(result.excerpt, /audit_storage/);
  assert.ok(result.excerpt.length <= OPS_RUNBOOK_EXCERPT_MAX_CHARS);

  for (const pattern of FORBIDDEN_EXCERPT_FRAGMENTS) {
    assert.doesNotMatch(result.excerpt, pattern);
  }
});

test("loadOpsRunbookExcerpt rejects guide articles", () => {
  resetKnowledgeManifestCacheForTests();
  assert.throws(
    () => loadOpsRunbookExcerpt("vault-overview#protected-view"),
    /not ops-visible|not found/i
  );
});

test("extractRunbookSection fails for missing anchor", () => {
  const body = "## Bucket privacy\n\nStep one.";
  assert.throws(
    () => extractRunbookSection(body, "#missing-anchor"),
    /Runbook section not found/
  );
});

test("splitRunbookSections parses multiple sections", () => {
  const sections = splitRunbookSections("## One\n\nA\n\n## Two\n\nB");
  assert.equal(sections.length, 2);
  assert.equal(sections[0].anchor, "#one");
  assert.equal(sections[1].anchor, "#two");
});

test("truncateRunbookExcerpt caps long text", () => {
  const long = "a".repeat(OPS_RUNBOOK_EXCERPT_MAX_CHARS + 50);
  const truncated = truncateRunbookExcerpt(long);
  assert.ok(truncated.length <= OPS_RUNBOOK_EXCERPT_MAX_CHARS);
  assert.match(truncated, /…$/);
});
