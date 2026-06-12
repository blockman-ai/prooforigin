import { GUIDE_ABUSE_REFUSAL, isGuideQuestionBlocked } from "../../lib/guideAbuseGuard.js";
import {
  getGuideSuggestedFollowUps,
  loadGuideHelpSnippet,
  resolveGuideTopic,
} from "../../lib/guideHelpMap.js";
import { buildDeterministicGuideAnswer, GUIDE_DISCLAIMER } from "../../lib/guidePrompt.js";
import { checkGuideRateLimit } from "../../lib/guideRateLimit.js";
import { validateGuideRequest } from "../../lib/guideSchema.js";

export const GUIDE_CACHE_CONTROL = "no-store";

function guideJsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": GUIDE_CACHE_CONTROL,
      ...headers,
    },
  });
}

export async function POST(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return guideJsonResponse({ error: "Guide requests must use application/json." }, 415);
  }

  const rateLimit = checkGuideRateLimit(request);
  if (!rateLimit.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000));
    return guideJsonResponse(
      { error: "Guide rate limit exceeded. Try again later." },
      429,
      { "Retry-After": String(retryAfterSeconds) }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return guideJsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (body?.file || body?.image || body?.audio || body?.upload) {
    return guideJsonResponse({ error: "File uploads are not supported." }, 400);
  }

  let validated;
  try {
    validated = validateGuideRequest(body);
  } catch (error) {
    return guideJsonResponse({ error: error.message || "Invalid guide request." }, 400);
  }

  if (isGuideQuestionBlocked(validated.question)) {
    return guideJsonResponse({
      answer: GUIDE_ABUSE_REFUSAL,
      disclaimer: GUIDE_DISCLAIMER,
      topic: "refusal",
      suggestedFollowUps: [],
      mode: "deterministic",
    });
  }

  const topicId = resolveGuideTopic(validated.question, validated.context);
  const snippet = loadGuideHelpSnippet(topicId);
  const result = buildDeterministicGuideAnswer({
    question: validated.question,
    context: validated.context,
    snippet,
  });

  return guideJsonResponse({
    answer: result.answer,
    disclaimer: result.disclaimer,
    topic: result.topic,
    suggestedFollowUps: getGuideSuggestedFollowUps(topicId),
    mode: "deterministic",
  });
}
