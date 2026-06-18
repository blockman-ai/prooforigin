"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import GlassPanel from "../../../../components/protocol/GlassPanel";
import PageShell from "../../../../components/protocol/PageShell";
import ProofField from "../../../../components/protocol/ProofField";
import ProtocolBadge from "../../../../components/protocol/ProtocolBadge";
import StatusCard from "../../../../components/protocol/StatusCard";
import DisclosureTimeline from "../../../../components/vault/DisclosureTimeline";
import {
  buildAccessCountMeter,
  deriveGrantDisplayStatus,
  formatOwnerGrantType,
  formatOwnerScopeType,
  formatOwnerTimestamp,
  grantStatusBadgeVariant,
  loadOwnerDisclosureGrantDetail,
  revokeOwnerDisclosureGrant,
  truncateOwnerHash,
} from "../../../lib/disclosureOwnerClient";

function AccessCountMeter({ accessCount, maxAccessCount }) {
  const meter = buildAccessCountMeter(accessCount, maxAccessCount);

  return (
    <div className="disclosure-access-meter" aria-label={`Access uses ${meter.label}`}>
      <div className="disclosure-access-meter__label">
        <span>Access uses</span>
        <strong>{meter.label}</strong>
      </div>
      <div className="disclosure-access-meter__track" aria-hidden="true">
        <div
          className="disclosure-access-meter__fill"
          style={{ width: `${meter.percent}%` }}
        />
      </div>
      {meter.capReached && (
        <p className="disclosure-access-meter__note">Access cap reached</p>
      )}
    </div>
  );
}

function RevokeGrantModal({ open, busy, error, onClose, onConfirm }) {
  const [localError, setLocalError] = useState("");

  if (!open) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError("");
    try {
      await onConfirm();
    } catch (err) {
      setLocalError(err.message || "Unable to revoke disclosure grant.");
    }
  }

  return (
    <div className="vault-modal-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="vault-modal vault-modal--danger"
        role="dialog"
        aria-labelledby="disclosure-revoke-title"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="vault-modal__header">
          <div>
            <h3 id="disclosure-revoke-title" className="vault-modal__title">
              Revoke disclosure grant
            </h3>
            <p className="vault-modal__subtitle">
              Active recipient sessions for this grant will be invalidated immediately.
            </p>
          </div>
        </header>

        <form className="vault-modal__form" onSubmit={handleSubmit}>
          <div className="alert-banner alert-banner--warning" role="status">
            <strong>This action cannot be undone</strong>
            Recipients will no longer be able to access or verify this grant.
          </div>

          {(localError || error) && (
            <div className="alert-banner alert-banner--error" role="alert">
              <strong>Unable to revoke grant</strong>
              {localError || error}
            </div>
          )}

          <div className="vault-modal__actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Revoking…" : "Revoke grant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DisclosureReceiptPanel({ receipt }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <GlassPanel className="disclosure-receipt-panel">
      <div className="record-list__header">
        <strong className="record-list__title">{truncateOwnerHash(receipt.receipt_id, 8, 6)}</strong>
        <ProtocolBadge variant="success">{receipt.result || "success"}</ProtocolBadge>
      </div>
      <p className="record-list__meta">Created {formatOwnerTimestamp(receipt.created_at)}</p>
      <div className="proof-grid">
        <ProofField label="Receipt hash" value={receipt.receipt_hash} mono />
        <ProofField label="Event ref" value={receipt.event_ref} mono />
      </div>
      <button
        type="button"
        className="secondary disclosure-receipt-panel__toggle"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Hide receipt details" : "Show receipt details"}
      </button>
      {expanded && (
        <div className="proof-grid">
          <ProofField
            label="Policy snapshot hash"
            value={truncateOwnerHash(receipt.policy_snapshot_hash)}
            mono
          />
          <ProofField
            label="Condition profile hash"
            value={truncateOwnerHash(receipt.condition_profile_hash)}
            mono
          />
          <ProofField
            label="Custody snapshot hash"
            value={truncateOwnerHash(receipt.custody_snapshot_hash)}
            mono
          />
          <ProofField
            label="Disclosure digest"
            value={truncateOwnerHash(receipt.disclosure_digest)}
            mono
          />
          <ProofField label="Scope type" value={formatOwnerScopeType(receipt.scope_type)} />
        </div>
      )}
    </GlassPanel>
  );
}

export default function VaultDisclosureDetailPage() {
  const params = useParams();
  const grantId = String(params?.grant_id || "").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [grant, setGrant] = useState(null);
  const [events, setEvents] = useState([]);
  const [chain, setChain] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState("");
  const [revokeNotice, setRevokeNotice] = useState("");

  const loadDetail = useCallback(async () => {
    if (!grantId) return;

    setLoading(true);
    setError("");

    try {
      const result = await loadOwnerDisclosureGrantDetail(grantId);
      if (!result.ok) {
        throw new Error(result.error || "Unable to load disclosure grant.");
      }

      setGrant(result.grant);
      setEvents(result.events);
      setChain(result.chain);
      setReceipts(result.receipts);
    } catch (err) {
      setGrant(null);
      setEvents([]);
      setChain(null);
      setReceipts([]);
      setError(err.message || "Unable to load disclosure grant.");
    } finally {
      setLoading(false);
    }
  }, [grantId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const displayStatus = useMemo(() => deriveGrantDisplayStatus(grant), [grant]);
  const canRevoke = displayStatus === "active";

  async function handleRevokeGrant() {
    setRevokeBusy(true);
    setRevokeError("");

    try {
      const result = await revokeOwnerDisclosureGrant(grantId);
      if (!result.ok) {
        throw new Error(result.error || "Unable to revoke disclosure grant.");
      }

      setRevokeOpen(false);
      setRevokeNotice(
        result.idempotent
          ? "This grant was already revoked."
          : `Grant revoked. ${result.revokedSessions} active session${
              result.revokedSessions === 1 ? "" : "s"
            } invalidated.`
      );
      await loadDetail();
    } catch (err) {
      setRevokeError(err.message || "Unable to revoke disclosure grant.");
      throw err;
    } finally {
      setRevokeBusy(false);
    }
  }

  return (
    <PageShell
      narrow
      badge="Vault Disclosure"
      title={grant?.purpose_label || "Disclosure grant"}
      subtitle="Review access usage, event chain integrity, and disclosure receipts."
      className="disclosure-owner-page"
      heroAlign="left"
    >
      <div className="protocol-actions">
        <Link href="/vault/disclosure" className="secondary">
          Back to grants
        </Link>
        {canRevoke && (
          <button type="button" className="secondary" onClick={() => setRevokeOpen(true)}>
            Revoke grant
          </button>
        )}
      </div>

      {loading && (
        <div className="alert-banner alert-banner--warning" role="status">
          Loading disclosure grant…
        </div>
      )}

      {error && !loading && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Disclosure grant unavailable</strong>
          {error}
        </div>
      )}

      {revokeNotice && !loading && (
        <StatusCard variant="success" title="Grant updated" body={revokeNotice} />
      )}

      {!loading && !error && grant && (
        <>
          <GlassPanel title="Grant summary">
            <div className="record-list__header">
              <ProtocolBadge variant={grantStatusBadgeVariant(displayStatus)}>
                {displayStatus}
              </ProtocolBadge>
              <ProtocolBadge variant="pending">{formatOwnerGrantType(grant.grant_type)}</ProtocolBadge>
            </div>
            <div className="proof-grid">
              <ProofField label="Grant ID" value={grant.grant_id} mono />
              <ProofField label="Scope type" value={formatOwnerScopeType(grant.scope_type)} />
              <ProofField label="Purpose" value={grant.purpose_label} />
              <ProofField label="Policy ref" value={grant.policy_ref} mono />
              <ProofField label="Created" value={formatOwnerTimestamp(grant.created_at)} />
              <ProofField label="Expires" value={formatOwnerTimestamp(grant.expires_at)} />
              <ProofField label="Updated" value={formatOwnerTimestamp(grant.updated_at)} />
              {grant.revoked_at && (
                <ProofField label="Revoked" value={formatOwnerTimestamp(grant.revoked_at)} />
              )}
            </div>
            <AccessCountMeter
              accessCount={grant.access_count}
              maxAccessCount={grant.max_access_count}
            />
          </GlassPanel>

          <DisclosureTimeline events={events} chain={chain} />

          <section aria-label="Disclosure receipts">
            <GlassPanel title="Receipts">
              {receipts.length ? (
                <div className="record-list">
                  {receipts.map((receipt) => (
                    <DisclosureReceiptPanel key={receipt.receipt_id} receipt={receipt} />
                  ))}
                </div>
              ) : (
                <p className="record-list__empty">
                  No receipts yet. A receipt appears after a recipient completes access.
                </p>
              )}
            </GlassPanel>
          </section>
        </>
      )}

      <RevokeGrantModal
        open={revokeOpen}
        busy={revokeBusy}
        error={revokeError}
        onClose={() => {
          if (revokeBusy) return;
          setRevokeOpen(false);
          setRevokeError("");
        }}
        onConfirm={handleRevokeGrant}
      />
    </PageShell>
  );
}
