import fs from "node:fs";
import path from "node:path";
import {
  getGuideArticleById,
  KNOWLEDGE_DIR,
  loadKnowledgeManifest,
} from "./knowledgeIndex.js";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function stripKnowledgeFrontmatter(rawContent) {
  const content = String(rawContent || "");
  const match = content.match(FRONTMATTER_PATTERN);

  if (!match) {
    return normalizeKnowledgeBody(content);
  }

  return normalizeKnowledgeBody(content.slice(match[0].length));
}

export function normalizeKnowledgeBody(body) {
  return String(body || "")
    .replace(/^\s+/, "")
    .replace(/\r\n/g, "\n");
}

export function parseKnowledgeFrontmatter(rawContent) {
  const content = String(rawContent || "");
  const match = content.match(FRONTMATTER_PATTERN);

  if (!match) {
    return {
      frontmatter: {},
      body: normalizeKnowledgeBody(content),
    };
  }

  const frontmatter = {};
  const lines = match[1].split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    frontmatter[key] = value;
  }

  return {
    frontmatter,
    body: normalizeKnowledgeBody(content.slice(match[0].length)),
  };
}

export function loadKnowledgeArticleFile(relativePath) {
  const filePath = path.join(KNOWLEDGE_DIR, relativePath);
  return fs.readFileSync(filePath, "utf8");
}

export function loadGuideHelpSnippet(topicId, manifest = loadKnowledgeManifest()) {
  const article =
    getGuideArticleById(topicId, manifest) ||
    getGuideArticleById(manifest.topic_resolution?.default || "vault-overview", manifest);

  const raw = loadKnowledgeArticleFile(article.path);
  const { body } = parseKnowledgeFrontmatter(raw);

  return {
    id: article.id,
    title: article.title,
    body,
  };
}
