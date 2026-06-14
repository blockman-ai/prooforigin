import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { getGuideArticles, loadKnowledgeManifest } from "../../app/lib/knowledgeIndex.js";
import {
  loadGuideHelpSnippet,
  loadKnowledgeArticleFile,
  normalizeKnowledgeBody,
  parseKnowledgeFrontmatter,
  stripKnowledgeFrontmatter,
} from "../../app/lib/knowledgeLoader.js";

const KNOWLEDGE_GUIDE_DIR = path.join(process.cwd(), "docs", "knowledge", "guide");

test("stripKnowledgeFrontmatter removes yaml header", () => {
  const raw = "---\nid: demo\n---\n\n# Title\n\nBody";
  assert.equal(stripKnowledgeFrontmatter(raw), "# Title\n\nBody");
});

test("parseKnowledgeFrontmatter extracts id metadata", () => {
  const raw = "---\nid: passkey\nversion: 1\n---\n# Passkey";
  const parsed = parseKnowledgeFrontmatter(raw);
  assert.equal(parsed.frontmatter.id, "passkey");
  assert.match(parsed.body, /^# Passkey/);
});

test("loadGuideHelpSnippet returns title and body without frontmatter", () => {
  const snippet = loadGuideHelpSnippet("passkey");
  assert.equal(snippet.id, "passkey");
  assert.equal(snippet.title, "Vault passkeys");
  assert.doesNotMatch(snippet.body, /^---/);
  assert.match(snippet.body, /^# Vault passkeys/);
});

test("guide articles use knowledge-native source_of_truth and frontmatter", () => {
  const manifest = loadKnowledgeManifest();

  for (const article of getGuideArticles(manifest)) {
    const expectedSource = `docs/knowledge/${article.path}`;
    assert.equal(article.source_of_truth, expectedSource, `${article.id} manifest source_of_truth`);

    const raw = loadKnowledgeArticleFile(article.path);
    const { frontmatter, body } = parseKnowledgeFrontmatter(raw);

    assert.equal(frontmatter.id, article.id, `${article.id} frontmatter id`);
    assert.equal(
      frontmatter.source_of_truth,
      expectedSource,
      `${article.id} frontmatter source_of_truth`
    );
    assert.ok(normalizeKnowledgeBody(body).length > 40, `${article.id} body too short`);
    assert.doesNotMatch(body, /^---/);
  }
});

test("guide article files exist only under docs/knowledge/guide", () => {
  const manifest = loadKnowledgeManifest();
  const guideFiles = fs
    .readdirSync(KNOWLEDGE_GUIDE_DIR)
    .filter((entry) => entry.endsWith(".md"))
    .sort();

  const manifestPaths = getGuideArticles(manifest)
    .map((article) => path.basename(article.path))
    .sort();

  assert.deepEqual(guideFiles, manifestPaths);
});

test("loadGuideHelpSnippet loads phase 1 guide articles", () => {
  const platform = loadGuideHelpSnippet("platform-overview");
  assert.match(platform.body, /Trust Pass/);
  assert.match(platform.body, /Sentinel/);

  const trustPass = loadGuideHelpSnippet("trust-pass-overview");
  assert.match(trustPass.body, /Live Trust Code is the primary proof/i);

  const voice = loadGuideHelpSnippet("voice-anchor-overview");
  assert.match(voice.body, /Voice documented/i);
  assert.match(voice.body, /not \*\*Voice verified\*\*/i);

  const boundaries = loadGuideHelpSnippet("product-boundaries");
  assert.match(boundaries.body, /cannot unlock your vault/i);
});

test("loadGuideHelpSnippet falls back to default topic", () => {
  const snippet = loadGuideHelpSnippet("not-a-real-topic");
  assert.equal(snippet.id, "vault-overview");
  assert.match(snippet.body, /Your Private Vault/);
});
