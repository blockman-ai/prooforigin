import fs from "node:fs";
import path from "node:path";
import { parseKnowledgeFrontmatter } from "./knowledgeLoader.js";

export const KNOWLEDGE_DIR = path.join(process.cwd(), "docs", "knowledge");

export const CORPUS_VERSION_PATTERN = /^\d{4}\.\d{2}\.\d+$/;
export const LAST_REVIEWED_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const KNOWLEDGE_STALE_AFTER_DAYS = 90;
export const LEGACY_HELP_DIR = path.join(process.cwd(), "docs", "help");

export function validateCorpusVersion(corpusVersion) {
  const value = String(corpusVersion || "").trim();
  if (!CORPUS_VERSION_PATTERN.test(value)) {
    throw new Error(`corpus_version must match YYYY.MM.N format, got "${corpusVersion}".`);
  }
}

export function validateLastReviewedDate(value, label) {
  const raw = String(value || "").trim();
  if (!LAST_REVIEWED_PATTERN.test(raw)) {
    throw new Error(`${label} must be ISO date YYYY-MM-DD.`);
  }

  const parsed = Date.parse(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    throw new Error(`${label} is not a valid date: ${raw}`);
  }

  return raw;
}

export function readArticleLastReviewed(article) {
  const filePath = path.join(KNOWLEDGE_DIR, article.path);
  const raw = fs.readFileSync(filePath, "utf8");
  const { frontmatter } = parseKnowledgeFrontmatter(raw);
  return frontmatter.last_reviewed || null;
}

export function getStaleArticleWarnings(
  manifest,
  { now = new Date(), staleAfterDays = KNOWLEDGE_STALE_AFTER_DAYS } = {}
) {
  const warnings = [];
  const cutoffMs = now.getTime() - staleAfterDays * 24 * 60 * 60 * 1000;

  for (const article of manifest.articles) {
    if (article.status !== "active") {
      continue;
    }

    let lastReviewed;
    try {
      lastReviewed = readArticleLastReviewed(article);
    } catch (error) {
      warnings.push({
        article_id: article.id,
        code: "last_reviewed_unreadable",
        message: error.message,
      });
      continue;
    }

    if (!lastReviewed) {
      warnings.push({
        article_id: article.id,
        code: "missing_last_reviewed",
        message: `${article.id} is missing frontmatter last_reviewed.`,
      });
      continue;
    }

    const reviewedAt = Date.parse(`${lastReviewed}T00:00:00.000Z`);
    if (reviewedAt < cutoffMs) {
      warnings.push({
        article_id: article.id,
        code: "stale_article",
        last_reviewed: lastReviewed,
        stale_after_days: staleAfterDays,
        message: `${article.id} last reviewed ${lastReviewed} exceeds ${staleAfterDays} day threshold.`,
      });
    }
  }

  return warnings;
}

function assertRouteValue(route, label) {
  if (typeof route !== "string" || !route.startsWith("/")) {
    throw new Error(`${label} must be an app route starting with "/".`);
  }
}

export function validateKnowledgeDrift(manifest) {
  validateCorpusVersion(manifest.corpus_version);

  const articleIds = new Set();

  for (const article of manifest.articles) {
    if (!article?.id) {
      throw new Error("Every manifest article must include a non-empty id.");
    }

    if (articleIds.has(article.id)) {
      throw new Error(`Duplicate manifest article id: ${article.id}`);
    }

    articleIds.add(article.id);
  }

  for (const article of manifest.articles) {
    if (article.status !== "active") {
      throw new Error(`Knowledge drift checks only support active articles (${article.id}).`);
    }

    const filePath = path.join(KNOWLEDGE_DIR, article.path);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Active article file missing for ${article.id}: ${filePath}`);
    }

    for (const relatedId of article.related || []) {
      if (!articleIds.has(relatedId)) {
        throw new Error(`Article ${article.id} related entry references unknown id: ${relatedId}`);
      }
    }

    if (article.audience.includes("guide")) {
      if (!Array.isArray(article.routes) || article.routes.length === 0) {
        throw new Error(`Guide article ${article.id} must declare at least one route.`);
      }

      for (const route of article.routes) {
        assertRouteValue(route, `articles.${article.id}.routes`);
      }

      for (const feature of article.features || []) {
        if (typeof feature !== "string" || !feature.trim()) {
          throw new Error(`Guide article ${article.id} has invalid features entry.`);
        }
      }
    }

    if (article.source_of_truth) {
      const sourcePath = path.join(process.cwd(), article.source_of_truth);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Article ${article.id} source_of_truth missing: ${article.source_of_truth}`);
      }

      if (article.source_of_truth.startsWith("docs/help/")) {
        throw new Error(
          `Article ${article.id} still references deprecated docs/help source_of_truth.`
        );
      }

      const expectedSource = `docs/knowledge/${article.path}`;
      if (article.source_of_truth !== expectedSource) {
        throw new Error(
          `Article ${article.id} source_of_truth must be ${expectedSource}, got ${article.source_of_truth}.`
        );
      }
    }

    const lastReviewed = readArticleLastReviewed(article);
    validateLastReviewedDate(lastReviewed, `${article.id}.last_reviewed`);
  }

  const topicResolution = manifest.topic_resolution || {};

  if (!articleIds.has(topicResolution.default)) {
    throw new Error(`topic_resolution.default references unknown article: ${topicResolution.default}`);
  }

  for (const [feature, topicId] of Object.entries(topicResolution.by_feature || {})) {
    if (!articleIds.has(topicId)) {
      throw new Error(`topic_resolution.by_feature.${feature} references unknown article: ${topicId}`);
    }
  }

  for (const [contextKey, topicId] of Object.entries(topicResolution.by_context || {})) {
    if (!articleIds.has(topicId)) {
      throw new Error(`topic_resolution.by_context.${contextKey} references unknown article: ${topicId}`);
    }
  }

  return manifest;
}

export function auditLegacyHelpInventory(manifest) {
  if (!fs.existsSync(LEGACY_HELP_DIR)) {
    return [];
  }

  const helpFiles = fs
    .readdirSync(LEGACY_HELP_DIR)
    .filter((entry) => entry.endsWith(".md"))
    .sort();

  return helpFiles.map((fileName) => {
    const legacyRelativePath = `docs/help/${fileName}`;
    const knowledgeRelativePath = `docs/knowledge/guide/${fileName}`;
    const knowledgePath = path.join(process.cwd(), knowledgeRelativePath);
    const referencingArticles = manifest.articles.filter(
      (article) => article.source_of_truth === legacyRelativePath
    );

    let recommendation = "can_delete_now";
    if (referencingArticles.length > 0) {
      recommendation = "keep_temporarily";
    } else if (fs.existsSync(knowledgePath)) {
      recommendation = "replace_with_knowledge_reference";
    }

    return {
      file: legacyRelativePath,
      knowledge_copy_exists: fs.existsSync(knowledgePath),
      referencing_article_ids: referencingArticles.map((article) => article.id),
      recommendation,
    };
  });
}

export function getKnowledgeReadinessReport(manifest) {
  validateKnowledgeDrift(manifest);

  const staleWarnings = getStaleArticleWarnings(manifest);
  const legacyHelp = auditLegacyHelpInventory(manifest);
  const legacyPending = legacyHelp.filter((entry) => entry.recommendation === "keep_temporarily");
  const legacyReplace = legacyHelp.filter(
    (entry) => entry.recommendation === "replace_with_knowledge_reference"
  );

  let score = 100;
  score -= staleWarnings.length * 5;
  score -= legacyPending.length * 2;
  score -= legacyReplace.length;

  if (score < 0) {
    score = 0;
  }

  return {
    score,
    corpus_version: manifest.corpus_version,
    article_count: manifest.articles.length,
    stale_warning_count: staleWarnings.length,
    stale_warnings: staleWarnings,
    legacy_help_count: legacyHelp.length,
    legacy_help_pending: legacyPending.length,
    legacy_help: legacyHelp,
    v1_complete:
      score >= 90 &&
      staleWarnings.length === 0 &&
      legacyPending.length === 0 &&
      legacyHelp.length === 0,
  };
}
