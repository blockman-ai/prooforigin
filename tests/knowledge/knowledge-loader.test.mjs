import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { getGuideArticles, loadKnowledgeManifest } from "../../app/lib/knowledgeIndex.js";
import {
  loadGuideHelpSnippet,
  normalizeKnowledgeBody,
  parseKnowledgeFrontmatter,
  stripKnowledgeFrontmatter,
} from "../../app/lib/knowledgeLoader.js";

const LEGACY_HELP_DIR = path.join(process.cwd(), "docs", "help");

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

test("knowledge guide bodies match legacy help files", () => {
  const manifest = loadKnowledgeManifest();

  for (const article of getGuideArticles(manifest)) {
    const legacyFileName = path.basename(article.path);
    const legacyPath = path.join(LEGACY_HELP_DIR, legacyFileName);
    if (!fs.existsSync(legacyPath)) {
      continue;
    }

    const legacyBody = normalizeKnowledgeBody(fs.readFileSync(legacyPath, "utf8"));
    const snippet = loadGuideHelpSnippet(article.id);

    assert.equal(
      snippet.body,
      legacyBody,
      `${article.id} body drifted from docs/help/${legacyFileName}`
    );
  }
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
