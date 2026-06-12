import { getGuideSuggestedFollowUps } from "./guideHelpMap.js";
import { generateGuideOpenAIAnswer, isGuideOpenAIConfigured } from "./guideOpenAI.js";
import { buildDeterministicGuideAnswer, GUIDE_DISCLAIMER } from "./guidePrompt.js";

export { isGuideOpenAIConfigured };

export async function buildGuideAnswer({ question, context, topicId, snippet, generateOpenAI }) {
  const generate = generateOpenAI ?? generateGuideOpenAIAnswer;

  if (isGuideOpenAIConfigured()) {
    try {
      const openAiResult = await generate({
        question,
        context,
        snippet,
      });

      if (openAiResult?.answer) {
        return {
          answer: openAiResult.answer,
          disclaimer: openAiResult.disclaimer || GUIDE_DISCLAIMER,
          topic: openAiResult.topic || topicId,
          suggestedFollowUps: getGuideSuggestedFollowUps(topicId),
          mode: "openai",
        };
      }
    } catch {
      // Fall through to deterministic fallback.
    }
  }

  const deterministic = buildDeterministicGuideAnswer({
    question,
    context,
    snippet,
  });

  return {
    answer: deterministic.answer,
    disclaimer: deterministic.disclaimer,
    topic: deterministic.topic,
    suggestedFollowUps: getGuideSuggestedFollowUps(topicId),
    mode: "deterministic",
  };
}
