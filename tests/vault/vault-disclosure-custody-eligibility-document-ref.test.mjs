import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { register } from "node:module";
import { buildDocumentScopeRefHash } from "../../app/lib/vaultDisclosurePolicy.js";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const VAULT_ID = "44444444-4444-4444-8444-444444444444";
const DOCUMENT_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_VAULT_ID = "66666666-6666-4666-8666-666666666666";
const SCOPE_REF = buildDocumentScopeRefHash(DOCUMENT_ID);

test("document_ref custody eligibility scenarios", async (t) => {
  const state = {
    vaultId: null,
    document: {
      id: DOCUMENT_ID,
      vault_id: VAULT_ID,
      compromised_at: null,
      deleted_at: null,
      source_retired_at: null,
    },
  };

  mock.module("../../app/lib/vaultAdmin.js", {
    exports: {
      getVaultDocumentById: async () => ({
        document: state.document,
        error: null,
      }),
      listVaultCustodyDocuments: async () => ({ documents: [], error: null }),
      createVaultAdminClient: () => ({
        from: () => ({
          select: () => ({
            is: async () => ({
              data: [state.document],
              error: null,
            }),
          }),
        }),
      }),
    },
  });

  const { evaluateDisclosureCustodyEligibility } = await import(
    "../../app/lib/vaultDisclosureCustodyEligibility.js"
  );

  state.vaultId = null;
  const recipientResult = await evaluateDisclosureCustodyEligibility({
    scopeType: "document_ref",
    scopeRefHash: SCOPE_REF,
  });
  assert.equal(recipientResult.eligible, true);
  assert.equal(recipientResult.reasonCode, null);

  const ownerMismatch = await evaluateDisclosureCustodyEligibility({
    scopeType: "document_ref",
    scopeRefHash: SCOPE_REF,
    vaultId: OTHER_VAULT_ID,
    documentId: DOCUMENT_ID,
  });
  assert.equal(ownerMismatch.eligible, false);
  assert.equal(ownerMismatch.reasonCode, "scope_vault_mismatch");

  t.mock.restoreAll();
});
