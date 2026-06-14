import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GUIDE_HELP_TOPICS,
  GUIDE_SUGGESTED_QUESTIONS,
  getGuideSuggestedFollowUps,
  loadGuideHelpSnippet,
  resolveGuideTopic,
} from "../../app/lib/guideHelpMap.js";

test("guideHelpMap exports knowledge-backed topic map", () => {
  assert.equal(Object.keys(GUIDE_HELP_TOPICS).length, 6);
  assert.ok(GUIDE_HELP_TOPICS["restore-vault"]);
  assert.ok(Array.isArray(GUIDE_HELP_TOPICS.passkey.keywords));
});

test("guideHelpMap migration layer preserves snippet loading API", () => {
  const snippet = loadGuideHelpSnippet("recovery-kit");
  assert.equal(snippet.id, "recovery-kit");
  assert.match(snippet.body, /Recovery Kit/);
});

test("guideHelpMap suggested follow ups stay capped at three", () => {
  const followUps = getGuideSuggestedFollowUps("passkey");
  assert.equal(followUps.length, 3);
  assert.ok(followUps.every((question) => typeof question === "string"));
});

test("guideHelpMap suggested questions remain unchanged", () => {
  assert.equal(GUIDE_SUGGESTED_QUESTIONS.length, 6);
  assert.equal(resolveGuideTopic(GUIDE_SUGGESTED_QUESTIONS[0].question), "vault-unlock");
});
