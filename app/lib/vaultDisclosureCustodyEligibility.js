import { getVaultDocumentById, listVaultCustodyDocuments, createVaultAdminClient } from "./vaultAdmin.js";
import { buildDocumentScopeRefHash } from "./vaultDisclosurePolicy.js";
import { computeDisclosureCustodySnapshotHash } from "./vaultDisclosureReceipt.js";

const VAULT_DOCUMENTS_TABLE = "vault_documents";

function buildCustodySnapshot(document) {
  return {
    eligible: !document?.compromised_at && !document?.deleted_at && !document?.source_retired_at,
    compromised: Boolean(document?.compromised_at),
    deleted: Boolean(document?.deleted_at),
    retired: Boolean(document?.source_retired_at),
  };
}

export async function findVaultDocumentIdByScopeRefHash({ vaultId, scopeRefHash }) {
  const { documents, error } = await listVaultCustodyDocuments(vaultId);
  if (error) {
    return { documentId: null, error };
  }

  for (const document of documents) {
    if (buildDocumentScopeRefHash(document.id) === scopeRefHash) {
      return { documentId: document.id, error: null };
    }
  }

  return { documentId: null, error: null };
}

export async function findVaultDocumentByScopeRefHash(scopeRefHash) {
  const supabase = createVaultAdminClient();
  const { data, error } = await supabase
    .from(VAULT_DOCUMENTS_TABLE)
    .select("id, vault_id, compromised_at, deleted_at, source_retired_at")
    .is("deleted_at", null);

  if (error) {
    return { document: null, error };
  }

  for (const row of data || []) {
    if (buildDocumentScopeRefHash(row.id) === scopeRefHash) {
      return {
        document: {
          id: row.id,
          vault_id: row.vault_id,
          compromised_at: row.compromised_at,
          deleted_at: row.deleted_at,
          source_retired_at: row.source_retired_at,
        },
        error: null,
      };
    }
  }

  return { document: null, error: null };
}

export async function evaluateDisclosureCustodyEligibility({
  scopeType,
  scopeRefHash,
  vaultId,
  documentId = null,
}) {
  if (scopeType === "vault_claim" || !scopeRefHash) {
    const snapshot = {
      eligible: true,
      compromised: false,
      deleted: false,
      retired: false,
    };
    return {
      eligible: true,
      reasonCode: null,
      custodySnapshotHash: computeDisclosureCustodySnapshotHash(snapshot),
      snapshot,
    };
  }

  if (scopeType !== "document_ref") {
    return {
      eligible: false,
      reasonCode: "scope_invalid",
      custodySnapshotHash: computeDisclosureCustodySnapshotHash({ eligible: false }),
      snapshot: { eligible: false },
    };
  }

  let resolvedDocumentId = documentId;
  if (!resolvedDocumentId) {
    const lookup = vaultId
      ? await findVaultDocumentIdByScopeRefHash({ vaultId, scopeRefHash })
      : await findVaultDocumentByScopeRefHash(scopeRefHash);
    if (lookup.error) {
      return {
        eligible: false,
        reasonCode: "custody_lookup_failed",
        custodySnapshotHash: computeDisclosureCustodySnapshotHash({ eligible: false }),
        snapshot: { eligible: false },
      };
    }
    resolvedDocumentId = lookup.documentId || lookup.document?.id || null;
  }

  if (!resolvedDocumentId) {
    return {
      eligible: false,
      reasonCode: "scope_not_found",
      custodySnapshotHash: computeDisclosureCustodySnapshotHash({ eligible: false }),
      snapshot: { eligible: false },
    };
  }

  const { document, error } = await getVaultDocumentById(resolvedDocumentId);
  if (error || !document) {
    return {
      eligible: false,
      reasonCode: "document_not_found",
      custodySnapshotHash: computeDisclosureCustodySnapshotHash({ eligible: false }),
      snapshot: { eligible: false },
    };
  }

  if (vaultId && document.vault_id !== vaultId) {
    return {
      eligible: false,
      reasonCode: "scope_vault_mismatch",
      custodySnapshotHash: computeDisclosureCustodySnapshotHash({ eligible: false }),
      snapshot: { eligible: false },
    };
  }

  const snapshot = buildCustodySnapshot(document);
  return {
    eligible: snapshot.eligible,
    reasonCode: snapshot.eligible ? null : "custody_ineligible",
    custodySnapshotHash: computeDisclosureCustodySnapshotHash(snapshot),
    snapshot,
  };
}
