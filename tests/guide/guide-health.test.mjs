import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { isGuideOpenAIConfigured } from "../../app/lib/guideOpenAI.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const productionHealthSource = readFileSync(
  join(__dirname, "../../app/lib/productionHealth.js"),
  "utf8"
);

test("production health report wires guide.openai_configured", () => {
  assert.match(productionHealthSource, /guide:\s*\{/);
  assert.match(productionHealthSource, /openai_configured:\s*isGuideOpenAIConfigured\(\)/);
});

test("guide OpenAI health flag reflects env without exposing secrets", () => {
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key-value";

  try {
    assert.equal(isGuideOpenAIConfigured(), true);
    assert.equal(JSON.stringify({ guide: { openai_configured: isGuideOpenAIConfigured() } }).includes("test-key-value"), false);
  } finally {
    if (original === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = original;
    }
  }
});
