import fs from "node:fs";
import path from "node:path";

export const KNOWLEDGE_DIR = path.join(process.cwd(), "docs", "knowledge");
export const KNOWLEDGE_MANIFEST_PATH = path.join(KNOWLEDGE_DIR, "manifest.json");

const GUIDE_AUDIENCE = "guide";

let cachedManifest = null;

function readManifestFile() {
  const raw = fs.readFileSync(KNOWLEDGE_MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
}

export function loadKnowledgeManifest({ forceReload = false } = {}) {
  if (!forceReload && cachedManifest) {
    return cachedManifest;
  }

  const manifest = readManifestFile();
  validateKnowledgeManifest(manifest);
  cachedManifest = manifest;
  return manifest;
}

export function resetKnowledgeManifestCacheForTests() {
  cachedManifest = null;
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
}

export function compileKeywordPatterns(keywordPatterns = []) {
  return keywordPatterns.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`keyword_patterns[${index}] must be an object.`);
    }

    assertString(entry.pattern, `keyword_patterns[${index}].pattern`);

    const flags = typeof entry.flags === "string" ? entry.flags : "";
    return new RegExp(entry.pattern, flags);
  });
}

export function validateKnowledgeManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Knowledge manifest must be a JSON object.");
  }

  if (manifest.schema_version !== 1) {
    throw new Error(`Unsupported knowledge manifest schema_version: ${manifest.schema_version}`);
  }

  assertString(manifest.corpus_version, "corpus_version");

  if (!Array.isArray(manifest.articles) || manifest.articles.length === 0) {
    throw new Error("Knowledge manifest must include at least one article.");
  }

  const seenIds = new Set();

  for (const article of manifest.articles) {
    assertString(article.id, "article.id");
    if (seenIds.has(article.id)) {
      throw new Error(`Duplicate knowledge article id: ${article.id}`);
    }
    seenIds.add(article.id);

    assertString(article.path, `articles.${article.id}.path`);
    assertString(article.title, `articles.${article.id}.title`);
    assertStringArray(article.audience, `articles.${article.id}.audience`);

    if (article.status !== "active") {
      throw new Error(`Phase 0 only supports active articles (${article.id}).`);
    }

    if (!article.audience.includes(GUIDE_AUDIENCE)) {
      throw new Error(`Guide corpus article ${article.id} must include guide audience.`);
    }

    compileKeywordPatterns(article.keyword_patterns || []);

    const filePath = path.join(KNOWLEDGE_DIR, article.path);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Knowledge article file missing for ${article.id}: ${filePath}`);
    }
  }

  const topicResolution = manifest.topic_resolution || {};
  assertString(topicResolution.default, "topic_resolution.default");

  if (!seenIds.has(topicResolution.default)) {
    throw new Error(`topic_resolution.default references unknown article: ${topicResolution.default}`);
  }

  for (const topicId of Object.values(topicResolution.by_feature || {})) {
    if (!seenIds.has(topicId)) {
      throw new Error(`topic_resolution.by_feature references unknown article: ${topicId}`);
    }
  }

  for (const topicId of Object.values(topicResolution.by_context || {})) {
    if (!seenIds.has(topicId)) {
      throw new Error(`topic_resolution.by_context references unknown article: ${topicId}`);
    }
  }

  return manifest;
}

export function getGuideArticles(manifest = loadKnowledgeManifest()) {
  return manifest.articles.filter((article) => article.audience.includes(GUIDE_AUDIENCE));
}

export function getGuideArticleById(topicId, manifest = loadKnowledgeManifest()) {
  return getGuideArticles(manifest).find((article) => article.id === topicId) || null;
}

export function buildGuideHelpTopicsMap(manifest = loadKnowledgeManifest()) {
  const topics = {};

  for (const article of getGuideArticles(manifest)) {
    topics[article.id] = {
      id: article.id,
      title: article.title,
      file: path.basename(article.path),
      keywords: compileKeywordPatterns(article.keyword_patterns || []),
    };
  }

  return topics;
}

export function getKnowledgeCorpusVersion(manifest = loadKnowledgeManifest()) {
  return manifest.corpus_version;
}

export function resolveGuideTopic(question, context = {}, manifest = loadKnowledgeManifest()) {
  const normalized = String(question || "").trim().toLowerCase();
  const articles = getGuideArticles(manifest);

  for (const article of articles) {
    const keywords = compileKeywordPatterns(article.keyword_patterns || []);
    if (keywords.some((pattern) => pattern.test(normalized))) {
      return article.id;
    }
  }

  const byFeature = manifest.topic_resolution?.by_feature || {};

  if (context.feature && byFeature[context.feature]) {
    return byFeature[context.feature];
  }

  const byContext = manifest.topic_resolution?.by_context || {};

  if (context.protectedView?.active && byContext["protectedView.active"]) {
    return byContext["protectedView.active"];
  }

  if (context.vault?.locked && byContext["vault.locked"]) {
    return byContext["vault.locked"];
  }

  return manifest.topic_resolution?.default || "vault-overview";
}
