import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getOpsArticles,
  getSentinelRuleMap,
  loadKnowledgeManifest,
  resetKnowledgeManifestCacheForTests,
  SENTINEL_S2_RECOMMENDATION_IDS,
} from "../../app/lib/knowledgeIndex.js";
import { loadOpsRunbookExcerpt } from "../../app/lib/knowledgeOpsLoader.js";

test("sentinel_rule_map covers all S2 recommendation ids", () => {
  resetKnowledgeManifestCacheForTests();
  const manifest = loadKnowledgeManifest();
  const ruleMap = getSentinelRuleMap(manifest);

  for (const ruleId of SENTINEL_S2_RECOMMENDATION_IDS) {
    assert.ok(ruleMap[ruleId], `missing sentinel_rule_map entry for ${ruleId}`);
    assert.ok(ruleMap[ruleId].knowledge_ref.includes("#"), `${ruleId} knowledge_ref needs anchor`);
  }

  assert.equal(Object.keys(ruleMap).length, SENTINEL_S2_RECOMMENDATION_IDS.length);
});

test("every sentinel_rule_map excerpt resolves", () => {
  resetKnowledgeManifestCacheForTests();
  const ruleMap = getSentinelRuleMap();

  for (const [ruleId, entry] of Object.entries(ruleMap)) {
    const result = loadOpsRunbookExcerpt(entry.knowledge_ref);
    assert.ok(result.excerpt.length > 0, `${ruleId} excerpt empty`);
    assert.equal(result.knowledge_ref, entry.knowledge_ref);
  }
});

test("ops article sentinel_rules align with sentinel_rule_map", () => {
  resetKnowledgeManifestCacheForTests();
  const manifest = loadKnowledgeManifest();
  const ruleMap = getSentinelRuleMap(manifest);
  const mappedRuleIds = new Set(Object.keys(ruleMap));

  for (const article of getOpsArticles(manifest)) {
    for (const ruleId of article.sentinel_rules || []) {
      assert.ok(mappedRuleIds.has(ruleId), `${article.id} lists unmapped rule ${ruleId}`);
      assert.equal(
        ruleMap[ruleId].knowledge_ref.split("#")[0],
        article.id,
        `${ruleId} should map to ${article.id}`
      );
    }
  }
});

test("guide.secret_request maps to recovery-kit guide topic", () => {
  resetKnowledgeManifestCacheForTests();
  const ruleMap = getSentinelRuleMap();
  assert.equal(ruleMap["guide.secret_request"].guide_topic, "recovery-kit");
});
