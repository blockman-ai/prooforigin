export const PRODUCTION_ENV_VARS = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    group: "supabase",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    group: "supabase",
    sensitive: true,
  },
  {
    key: "PROOFORIGIN_DTS_MASTER_KEY",
    required: true,
    group: "trust_pass",
    sensitive: true,
    productionRequired: true,
  },
  {
    key: "PROOFORIGIN_OPS_SECRET",
    required: false,
    group: "operations",
    sensitive: true,
  },
];

export const VAULT_HEALTH_TABLES = [
  "vault_documents",
  "vault_device_registrations",
  "vault_document_state_events",
  "vault_request_nonces",
];

export const TRUST_PASS_HEALTH_TABLES = [
  "identity_cards",
  "identity_card_state_events",
];

export const VOICE_ANCHOR_HEALTH_TABLES = ["voice_anchor_enrollments"];

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function isPlaceholderValue(value) {
  if (value == null) return true;
  const text = String(value).trim();
  return !text || text.includes("YOUR_");
}

export function checkEnvVarPresence(spec) {
  const raw = process.env[spec.key];
  const present = !isPlaceholderValue(raw);

  if (!present) {
    return {
      key: spec.key,
      group: spec.group,
      present: false,
      status: spec.productionRequired && isProductionRuntime() ? "missing_required" : "missing",
    };
  }

  return {
    key: spec.key,
    group: spec.group,
    present: true,
    status: "ok",
  };
}

export function buildEnvHealthReport() {
  const checks = PRODUCTION_ENV_VARS.map(checkEnvVarPresence);
  const missingRequired = checks.filter(
    (check) =>
      check.status === "missing_required" ||
      (check.status === "missing" &&
        PRODUCTION_ENV_VARS.find((spec) => spec.key === check.key)?.required)
  );

  return {
    runtime: process.env.NODE_ENV || "development",
    checks,
    all_required_present: missingRequired.length === 0,
  };
}
