import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEnvHealthReport, checkEnvVarPresence } from "../../app/lib/productionConfig.js";
import {
  shouldShowVaultRecoveryWarning,
  VAULT_RECOVERY_WARNING,
} from "../../app/lib/vaultRecoveryStatus.js";

test("buildEnvHealthReport marks placeholder env values as missing", () => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "YOUR_SUPABASE_URL";

  try {
    const report = buildEnvHealthReport();
    const supabaseUrl = report.checks.find((row) => row.key === "NEXT_PUBLIC_SUPABASE_URL");
    assert.equal(supabaseUrl.present, false);
    assert.equal(report.all_required_present, false);
  } finally {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original;
    }
  }
});

test("checkEnvVarPresence never returns secret values", () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "super-secret-key-value";

  try {
    const result = checkEnvVarPresence({
      key: "SUPABASE_SERVICE_ROLE_KEY",
      required: true,
      group: "supabase",
      sensitive: true,
    });

    assert.equal(result.present, true);
    assert.equal(result.status, "ok");
    assert.equal("value" in result, false);
  } finally {
    if (original === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = original;
    }
  }
});

test("vault recovery warning is shown until recovery kit ships", () => {
  assert.equal(shouldShowVaultRecoveryWarning(), true);
  assert.match(VAULT_RECOVERY_WARNING, /No Recovery Kit yet/i);
  assert.match(VAULT_RECOVERY_WARNING, /permanently lock your vault/i);
});
