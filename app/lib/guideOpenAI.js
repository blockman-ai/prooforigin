import OpenAI from "openai";
import {
  buildGuideOpenAIPromptBundle,
  buildOpenAIGuideRequest,
  GUIDE_DISCLAIMER,
} from "./guidePrompt.js";
import { filterGuideModelOutput } from "./guideOutputFilter.js";
import {
  GUIDE_SENTINEL_COUNTERS,
  recordGuideSentinelCounter,
} from "./guideSentinelCounters.js";

export function isGuideOpenAIConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || "").trim());
}

export async function generateGuideOpenAIAnswer({
  question,
  context,
  snippet,
  createClient,
  createResponse = null,
} = {}) {
  if (!isGuideOpenAIConfigured()) {
    return null;
  }

  const bundle = buildGuideOpenAIPromptBundle({ question, context, snippet });
  const request = buildOpenAIGuideRequest(bundle);

  const client =
    createClient?.() ?? new OpenAI({ apiKey: String(process.env.OPENAI_API_KEY).trim() });

  const response = createResponse
    ? await createResponse(client, request)
    : await client.responses.create(request);

  const rawText = String(response?.output_text || "").trim();
  if (!rawText) {
    return null;
  }

  const filtered = filterGuideModelOutput(rawText);
  if (!filtered.ok) {
    recordGuideSentinelCounter(GUIDE_SENTINEL_COUNTERS.OUTPUT_FILTER_REJECTED);
    return { outputFilterRejected: true };
  }

  return {
    answer: filtered.text,
    disclaimer: GUIDE_DISCLAIMER,
    topic: snippet.id,
    mode: "openai",
  };
}
