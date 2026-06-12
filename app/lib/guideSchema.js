export const GUIDE_QUESTION_MAX_LENGTH = 500;

export const GUIDE_FEATURES = new Set([
  "vault",
  "trust_pass",
  "recovery",
  "passkey",
  "voice_anchor",
  "protected_view",
  "timeline",
  "general",
]);

export const GUIDE_FORBIDDEN_CONTEXT_KEYS = new Set([
  "pin",
  "pinInput",
  "confirmPin",
  "masterVaultKey",
  "legacyPinKey",
  "mvk",
  "recoveryPhrase",
  "recoveryKit",
  "recovery_phrase",
  "recovery_kit",
  "wrapped_mvk",
  "credential_id",
  "vault_id",
  "vaultId",
  "genesis_hash",
  "genesisHash",
  "document",
  "documents",
  "ciphertext",
  "plaintext",
  "file",
  "files",
  "upload",
  "audio",
  "seed",
  "trustSeed",
  "trust_seed",
  "localStorage",
  "sessionStorage",
  "serviceRoleKey",
  "service_role_key",
  "openai_api_key",
  "dts_master_key",
]);

const VAULT_CONTEXT_KEYS = new Set([
  "locked",
  "mvkMode",
  "pinConfigured",
  "passkeyEnrolled",
  "passkeySupported",
  "recoveryConfigured",
]);

const PROTECTED_VIEW_KEYS = new Set(["active"]);
const APP_KEYS = new Set(["betaDisclaimer"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectForbiddenKeys(value, path = "", found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenKeys(entry, `${path}[${index}]`, found));
    return found;
  }

  if (!isPlainObject(value)) {
    return found;
  }

  for (const [key, nested] of Object.entries(value)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (GUIDE_FORBIDDEN_CONTEXT_KEYS.has(key)) {
      found.push(fullPath);
    }
    collectForbiddenKeys(nested, fullPath, found);
  }

  return found;
}

function assertBooleanOrNull(value, label) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function validateVaultContext(vault) {
  if (vault === undefined) {
    return undefined;
  }

  if (!isPlainObject(vault)) {
    throw new Error("context.vault must be an object.");
  }

  for (const key of Object.keys(vault)) {
    if (!VAULT_CONTEXT_KEYS.has(key)) {
      throw new Error(`context.vault.${key} is not allowed.`);
    }
  }

  return {
    locked: Boolean(vault.locked),
    mvkMode: Boolean(vault.mvkMode),
    pinConfigured: Boolean(vault.pinConfigured),
    passkeyEnrolled: Boolean(vault.passkeyEnrolled),
    passkeySupported: assertBooleanOrNull(vault.passkeySupported, "context.vault.passkeySupported"),
    recoveryConfigured: Boolean(vault.recoveryConfigured),
  };
}

function validateProtectedViewContext(protectedView) {
  if (protectedView === undefined) {
    return undefined;
  }

  if (!isPlainObject(protectedView)) {
    throw new Error("context.protectedView must be an object.");
  }

  for (const key of Object.keys(protectedView)) {
    if (!PROTECTED_VIEW_KEYS.has(key)) {
      throw new Error(`context.protectedView.${key} is not allowed.`);
    }
  }

  return {
    active: Boolean(protectedView.active),
  };
}

function validateAppContext(app) {
  if (app === undefined) {
    return undefined;
  }

  if (!isPlainObject(app)) {
    throw new Error("context.app must be an object.");
  }

  for (const key of Object.keys(app)) {
    if (!APP_KEYS.has(key)) {
      throw new Error(`context.app.${key} is not allowed.`);
    }
  }

  return {
    betaDisclaimer: Boolean(app.betaDisclaimer),
  };
}

export function validateGuideContext(context) {
  if (context === undefined || context === null) {
    return {};
  }

  if (!isPlainObject(context)) {
    throw new Error("context must be an object.");
  }

  const forbidden = collectForbiddenKeys(context);
  if (forbidden.length > 0) {
    throw new Error(`Forbidden context key: ${forbidden[0]}.`);
  }

  const validated = {};

  if (context.route !== undefined) {
    if (typeof context.route !== "string" || !context.route.trim()) {
      throw new Error("context.route must be a non-empty string.");
    }
    if (context.route.length > 200) {
      throw new Error("context.route is too long.");
    }
    validated.route = context.route.trim();
  }

  if (context.feature !== undefined) {
    if (!GUIDE_FEATURES.has(context.feature)) {
      throw new Error("context.feature is not supported.");
    }
    validated.feature = context.feature;
  }

  const vault = validateVaultContext(context.vault);
  if (vault) {
    validated.vault = vault;
  }

  const protectedView = validateProtectedViewContext(context.protectedView);
  if (protectedView) {
    validated.protectedView = protectedView;
  }

  const app = validateAppContext(context.app);
  if (app) {
    validated.app = app;
  }

  for (const key of Object.keys(context)) {
    if (!["route", "feature", "vault", "protectedView", "app"].includes(key)) {
      throw new Error(`context.${key} is not allowed.`);
    }
  }

  return validated;
}

export function validateGuideRequest(body) {
  if (!isPlainObject(body)) {
    throw new Error("Guide request body must be a JSON object.");
  }

  if (Object.keys(body).some((key) => !["question", "context"].includes(key))) {
    throw new Error("Guide request contains unsupported fields.");
  }

  if (typeof body.question !== "string") {
    throw new Error("question must be a string.");
  }

  const question = body.question.trim();
  if (!question) {
    throw new Error("question is required.");
  }

  if (question.length > GUIDE_QUESTION_MAX_LENGTH) {
    throw new Error(`question must be ${GUIDE_QUESTION_MAX_LENGTH} characters or fewer.`);
  }

  return {
    question,
    context: validateGuideContext(body.context),
  };
}
