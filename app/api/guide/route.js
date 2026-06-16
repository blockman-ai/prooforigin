import { GUIDE_ABUSE_REFUSAL, classifyGuideAbuse } from "../../lib/guideAbuseGuard.js";
import { buildGuideAnswer } from "../../lib/guideAnswer.js";
import {
  getGuideSuggestedFollowUps,
  loadGuideHelpSnippet,
  resolveGuideTopic,
} from "../../lib/guideHelpMap.js";
import { GUIDE_DISCLAIMER } from "../../lib/guidePrompt.js";
import { checkGuideRateLimit } from "../../lib/guideRateLimit.js";
import {
  GUIDE_SENTINEL_COUNTERS,
  recordGuideSentinelCounter,
  recordGuideSentinelRefusal,
} from "../../lib/guideSentinelCounters.js";
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

  const rateLimit = await checkGuideRateLimit(request);
  if (!rateLimit.allowed) {
    recordGuideSentinelCounter(GUIDE_SENTINEL_COUNTERS.RATE_LIMITED);
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
    if (error.message === "question is required.") {
      recordGuideSentinelCounter(GUIDE_SENTINEL_COUNTERS.REFUSAL_EMPTY_QUESTION);
    }
    return guideJsonResponse({ error: error.message || "Invalid guide request." }, 400);
  }

  const abuse = classifyGuideAbuse(validated.question);
  if (abuse.blocked) {
    recordGuideSentinelCounter(GUIDE_SENTINEL_COUNTERS.REQUEST_TOTAL);
    recordGuideSentinelRefusal(abuse.reason);
    return guideJsonResponse({
      answer: GUIDE_ABUSE_REFUSAL,
      disclaimer: GUIDE_DISCLAIMER,
      topic: "refusal",
      suggestedFollowUps: [],
      mode: "deterministic",
    });
  }

  recordGuideSentinelCounter(GUIDE_SENTINEL_COUNTERS.REQUEST_TOTAL);
  const topicId = resolveGuideTopic(validated.question, validated.context);
  const snippet = loadGuideHelpSnippet(topicId);
  const result = await buildGuideAnswer({
    question: validated.question,
    context: validated.context,
    topicId,
    snippet,
  });

  recordGuideSentinelCounter(
    result.mode === "openai"
      ? GUIDE_SENTINEL_COUNTERS.MODE_OPENAI
      : GUIDE_SENTINEL_COUNTERS.MODE_DETERMINISTIC
  );

  return guideJsonResponse({
    answer: result.answer,
    disclaimer: result.disclaimer,
    topic: result.topic,
    suggestedFollowUps: result.suggestedFollowUps ?? getGuideSuggestedFollowUps(topicId),
    mode: result.mode,
  });
}
