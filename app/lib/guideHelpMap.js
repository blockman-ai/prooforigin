import { buildGuideHelpTopicsMap, resolveGuideTopic as resolveKnowledgeGuideTopic } from "./knowledgeIndex.js";
import { loadGuideHelpSnippet as loadKnowledgeGuideSnippet } from "./knowledgeLoader.js";

export const GUIDE_HELP_TOPICS = buildGuideHelpTopicsMap();

export const GUIDE_SUGGESTED_QUESTIONS = [
  { label: "How do I unlock?", question: "How do I unlock?" },
  { label: "Why doesn't passkey work?", question: "Why doesn't passkey work?" },
  { label: "What is a Recovery Kit?", question: "What is a Recovery Kit?" },
  { label: "How do I restore on a new device?", question: "How do I restore on a new device?" },
  { label: "What does Voice documented mean?", question: "What does Voice documented mean?" },
  { label: "What is Protected View?", question: "What is Protected View?" },
];

export function resolveGuideTopic(question, context = {}) {
  return resolveKnowledgeGuideTopic(question, context);
}

export function loadGuideHelpSnippet(topicId) {
  return loadKnowledgeGuideSnippet(topicId);
}

export function getGuideSuggestedFollowUps(topicId) {
  return GUIDE_SUGGESTED_QUESTIONS.filter((entry) => {
    const resolved = resolveGuideTopic(entry.question);
    return resolved !== topicId;
  })
    .slice(0, 3)
    .map((entry) => entry.question);
}
