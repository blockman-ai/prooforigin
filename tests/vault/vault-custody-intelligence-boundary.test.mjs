import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(
  join(__dirname, "../../app/api/vault/custody-intelligence/route.js"),
  "utf8"
);
const builderSource = readFileSync(
  join(__dirname, "../../app/lib/vaultSentinelCustodyIntelligence.js"),
  "utf8"
);

test("custody intelligence boundary excludes sensitive fields and mutations", () => {
  assert.equal(routeSource.includes("POST("), false);
  assert.equal(routeSource.includes("DELETE("), false);
  assert.equal(routeSource.includes("dataset-capture"), false);
  assert.equal(routeSource.includes("disclosure"), false);
  assert.equal(builderSource.includes("label_ciphertext"), false);
  assert.equal(builderSource.includes("storage_path"), false);
  assert.equal(builderSource.includes("ciphertext_sha256"), false);
  assert.equal(builderSource.includes("state_hash"), false);
  assert.equal(builderSource.includes("auth_secret"), false);
});
