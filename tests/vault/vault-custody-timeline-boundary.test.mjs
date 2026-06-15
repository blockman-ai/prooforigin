import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(
  join(__dirname, "../../app/api/vault/custody-timeline/route.js"),
  "utf8"
);
const builderSource = readFileSync(
  join(__dirname, "../../app/lib/vaultCustodyTimeline.js"),
  "utf8"
);

test("custody timeline boundary excludes sensitive fields and mutations", () => {
  assert.equal(routeSource.includes("deleteVault"), false);
  assert.equal(routeSource.includes("POST("), false);
  assert.equal(builderSource.includes("state_hash"), false);
  assert.equal(builderSource.includes("label_ciphertext"), false);
  assert.equal(builderSource.includes("storage_path"), false);
  assert.equal(builderSource.includes("ciphertext_sha256"), false);
  assert.equal(builderSource.includes("auth_secret"), false);
});
