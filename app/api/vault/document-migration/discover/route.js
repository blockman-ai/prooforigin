import { NextResponse } from "next/server";
import { authorizeVaultRequest, vaultAuthFailureResponse } from "../../../../lib/vaultAuth";
import {
  getBoundVaultDeviceRegistration,
  getVaultOwnershipKey,
  isVaultAdminConfigured,
  listVaultDiscoveryDocuments,
  countLegacyUnboundVaultDocuments,
} from "../../../../lib/vaultAdmin";
import {
  recordVaultMigrationDiscoverySentinelCounter,
  VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS,
} from "../../../../lib/vaultMigrationDiscoverySentinelCounters";

export const dynamic = "force-dynamic";

function storageNotConfiguredResponse() {
  return NextResponse.json(
    {
      success: false,
      code: "STORAGE_NOT_CONFIGURED",
      error: "Vault storage is not configured. Set Supabase service role credentials.",
    },
    { status: 503 }
  );
}

function buildSafeEmptyDiscovery({ ownershipKeyRegistered = false } = {}) {
  return {
    success: true,
    discovery: {
      vault_id: null,
      ownership: {
        ownership_key_registered: ownershipKeyRegistered,
        migration_authority_verified: false,
        required_next_step: ownershipKeyRegistered
          ? "ownership_proof_verification_required"
          : "ownership_key_registration_required",
      },
      documents: [],
      legacy_unbound_candidate_count: 0,
    },
  };
}

function normalizeDiscoveryDocument(document) {
  const blockerCodes = [];
  if (document?.aad_version === 3) {
    blockerCodes.push("aad_v3_not_discovery_candidate");
  }
  if (document?.encryption_version === 1) {
    blockerCodes.push("legacy_pin_root_not_supported");
  }

  return {
    document_id: document.document_id,
    aad_version: document.aad_version,
    encryption_version: document.encryption_version,
    label_present: Boolean(document.label_present),
    created_at: document.created_at,
    updated_at: document.updated_at,
    blocker_codes: blockerCodes,
  };
}

export async function POST(req) {
  recordVaultMigrationDiscoverySentinelCounter(
    VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.REQUEST_TOTAL
  );

  try {
    const bodyText = await req.text();
    const auth = await authorizeVaultRequest(req, {
      method: "POST",
      path: "/api/vault/document-migration/discover",
      bodyText,
    });

    if (!auth.ok) {
      const status = auth.code === "STORAGE_NOT_CONFIGURED" ? 503 : auth.status;
      return NextResponse.json(vaultAuthFailureResponse(auth), { status });
    }

    if (!isVaultAdminConfigured()) {
      recordVaultMigrationDiscoverySentinelCounter(
        VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return storageNotConfiguredResponse();
    }

    const { registration, error: registrationError } = await getBoundVaultDeviceRegistration(
      auth.vault_device_id
    );
    if (registrationError) {
      recordVaultMigrationDiscoverySentinelCounter(
        VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "DISCOVERY_BINDING_LOOKUP_FAILED",
          error: registrationError.message || "Unable to determine vault discovery scope.",
        },
        { status: 502 }
      );
    }

    if (!registration?.vault_id) {
      recordVaultMigrationDiscoverySentinelCounter(
        VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.UNBOUND_DEVICE_TOTAL
      );
      return NextResponse.json(buildSafeEmptyDiscovery({ ownershipKeyRegistered: false }));
    }

    const vaultId = registration.vault_id;
    const { ownershipKey, error: ownershipError } = await getVaultOwnershipKey(vaultId);
    if (ownershipError) {
      recordVaultMigrationDiscoverySentinelCounter(
        VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "OWNERSHIP_LOOKUP_FAILED",
          error: ownershipError.message || "Unable to load vault ownership state.",
        },
        { status: 502 }
      );
    }

    const ownershipKeyRegistered = Boolean(ownershipKey);
    if (!ownershipKeyRegistered) {
      recordVaultMigrationDiscoverySentinelCounter(
        VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.OWNERSHIP_KEY_ABSENT_TOTAL
      );
    }

    const { documents, error: documentsError } = await listVaultDiscoveryDocuments(vaultId);
    if (documentsError) {
      recordVaultMigrationDiscoverySentinelCounter(
        VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "DISCOVERY_DOCUMENT_LOOKUP_FAILED",
          error: documentsError.message || "Unable to load vault discovery candidates.",
        },
        { status: 502 }
      );
    }

    const { count: legacyUnboundCandidateCount, error: legacyCountError } =
      await countLegacyUnboundVaultDocuments(vaultId);
    if (legacyCountError) {
      recordVaultMigrationDiscoverySentinelCounter(
        VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.ERROR_TOTAL
      );
      return NextResponse.json(
        {
          success: false,
          code: "DISCOVERY_LEGACY_COUNT_FAILED",
          error: legacyCountError.message || "Unable to load legacy discovery candidate counts.",
        },
        { status: 502 }
      );
    }

    recordVaultMigrationDiscoverySentinelCounter(
      VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.SUCCESS_TOTAL
    );

    return NextResponse.json({
      success: true,
      discovery: {
        vault_id: vaultId,
        ownership: {
          ownership_key_registered: ownershipKeyRegistered,
          migration_authority_verified: false,
          required_next_step: ownershipKeyRegistered
            ? "ownership_proof_verification_required"
            : "ownership_key_registration_required",
        },
        documents: (documents || []).map(normalizeDiscoveryDocument),
        legacy_unbound_candidate_count: legacyUnboundCandidateCount,
      },
    });
  } catch {
    recordVaultMigrationDiscoverySentinelCounter(
      VAULT_MIGRATION_DISCOVERY_SENTINEL_COUNTERS.ERROR_TOTAL
    );
    return NextResponse.json(
      { success: false, code: "INVALID_REQUEST", error: "Invalid vault discovery request." },
      { status: 400 }
    );
  }
}
