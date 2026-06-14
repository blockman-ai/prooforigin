import {
  getOpsArticleById,
  loadKnowledgeManifest,
} from "./knowledgeIndex.js";
import {
  loadKnowledgeArticleFile,
  normalizeKnowledgeBody,
  parseKnowledgeFrontmatter,
} from "./knowledgeLoader.js";

export const OPS_AUDIENCE = "ops";
export const OPS_RUNBOOK_EXCERPT_MAX_CHARS = 1200;

export function slugifyRunbookSection(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function parseKnowledgeRef(knowledgeRef) {
  const raw = String(knowledgeRef || "").trim();
  const hashIndex = raw.indexOf("#");

  if (hashIndex <= 0 || hashIndex === raw.length - 1) {
    throw new Error("knowledge_ref must use article-id#section-anchor format.");
  }

  const articleId = raw.slice(0, hashIndex).trim();
  const anchor = `#${raw.slice(hashIndex + 1).trim().toLowerCase()}`;

  if (!articleId || anchor === "#") {
    throw new Error("knowledge_ref must use article-id#section-anchor format.");
  }

  return { articleId, anchor };
}

export function splitRunbookSections(body) {
  const normalized = normalizeKnowledgeBody(body);
  const lines = normalized.split("\n");
  const sections = [];
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (current) {
        sections.push(current);
      }

      const title = headingMatch[1].trim();
      current = {
        title,
        anchor: `#${slugifyRunbookSection(title)}`,
        lines: [line],
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections;
}

export function extractRunbookSection(body, anchor) {
  const targetAnchor = String(anchor || "").trim().toLowerCase();
  const sections = splitRunbookSections(body);
  const section = sections.find((entry) => entry.anchor === targetAnchor);

  if (!section) {
    throw new Error(`Runbook section not found for anchor ${targetAnchor}.`);
  }

  return section.lines.join("\n").trim();
}

export function truncateRunbookExcerpt(text, maxChars = OPS_RUNBOOK_EXCERPT_MAX_CHARS) {
  const normalized = String(text || "").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

export function loadOpsRunbookExcerpt(knowledgeRef, manifest = loadKnowledgeManifest()) {
  const { articleId, anchor } = parseKnowledgeRef(knowledgeRef);
  const article = getOpsArticleById(articleId, manifest);

  if (!article) {
    throw new Error(`Ops runbook article not found: ${articleId}`);
  }

  if (!article.audience.includes(OPS_AUDIENCE)) {
    throw new Error(`Article ${articleId} is not ops-visible.`);
  }

  const raw = loadKnowledgeArticleFile(article.path);
  const { body } = parseKnowledgeFrontmatter(raw);
  const sectionBody = extractRunbookSection(body, anchor);

  return {
    knowledge_ref: `${articleId}${anchor}`,
    article_id: articleId,
    anchor,
    title: article.title,
    excerpt: truncateRunbookExcerpt(sectionBody),
  };
}
