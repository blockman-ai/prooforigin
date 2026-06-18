"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import GlassPanel from "../../../components/protocol/GlassPanel";
import PageShell from "../../../components/protocol/PageShell";
import ProofField from "../../../components/protocol/ProofField";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import StatusCard from "../../../components/protocol/StatusCard";
import {
  DISCLOSURE_RECEIPT_VERIFY_PHASE,
  fetchReceiptVerification,
  getReceiptVerifyPresentation,
  parseReceiptVerifyQueryReceiptId,
} from "../../lib/disclosureReceiptVerifyClient";
import {
  formatDisclosureScopeType,
  formatDisclosureTimestamp,
  truncateDisclosureHash,
} from "../../lib/disclosureRecipientClient";

function VerifyReceiptContent() {
  const searchParams = useSearchParams();
  const initialReceiptId = useMemo(
    () => parseReceiptVerifyQueryReceiptId(searchParams),
    [searchParams]
  );

  const [receiptId, setReceiptId] = useState(initialReceiptId);
  const [receiptHash, setReceiptHash] = useState("");
  const [phase, setPhase] = useState(DISCLOSURE_RECEIPT_VERIFY_PHASE.IDLE);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const presentation = useMemo(() => {
    if (phase === DISCLOSURE_RECEIPT_VERIFY_PHASE.IDLE) {
      return null;
    }
    return getReceiptVerifyPresentation(phase);
  }, [phase]);

  const onSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setPhase(DISCLOSURE_RECEIPT_VERIFY_PHASE.VERIFYING);
      setErrorMessage("");
      setResult(null);

      try {
        const verification = await fetchReceiptVerification({ receiptId, receiptHash });
        setPhase(verification.phase);
        setResult(verification.payload);

        if (verification.phase === DISCLOSURE_RECEIPT_VERIFY_PHASE.INVALID) {
          setErrorMessage(
            verification.payload?.error || "Receipt ID and receipt code are required."
          );
        }
      } catch {
        setPhase(DISCLOSURE_RECEIPT_VERIFY_PHASE.UNAVAILABLE);
        setErrorMessage("Receipt verification is temporarily unavailable.");
      }
    },
    [receiptId, receiptHash]
  );

  const showTechnicalDetails =
    result?.receipt &&
    (phase === DISCLOSURE_RECEIPT_VERIFY_PHASE.AUTHENTIC ||
      phase === DISCLOSURE_RECEIPT_VERIFY_PHASE.INTEGRITY_WARNING);

  return (
    <PageShell
      narrow
      heroAlign="left"
      badge="Check Proof"
      title="Check a ProofOrigin receipt"
      subtitle="Confirm a ProofOrigin receipt is authentic using the receipt ID and receipt code from your card."
    >
      <GlassPanel title="Enter receipt details">
        <form className="dts-verify-form trust-verify-form disclosure-receipt-verify-form" onSubmit={onSubmit}>
          <label className="dataset-field" htmlFor="receipt-id">
            <span className="dataset-field__label">Receipt ID</span>
            <input
              id="receipt-id"
              className="dataset-field__input"
              value={receiptId}
              onChange={(event) => setReceiptId(event.target.value.trim())}
              placeholder="55555555-5555-4555-8555-555555555555"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>

          <label className="dataset-field" htmlFor="receipt-hash">
            <span className="dataset-field__label">Receipt code</span>
            <input
              id="receipt-hash"
              className="dataset-field__input trust-verify-form__code"
              value={receiptHash}
              onChange={(event) => setReceiptHash(event.target.value.trim().toLowerCase())}
              placeholder="64-character receipt code"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>

          <div className="protocol-actions">
            <button
              type="submit"
              className="primary"
              disabled={phase === DISCLOSURE_RECEIPT_VERIFY_PHASE.VERIFYING}
            >
              {phase === DISCLOSURE_RECEIPT_VERIFY_PHASE.VERIFYING
                ? "Checking…"
                : "Check receipt"}
            </button>
          </div>
        </form>
      </GlassPanel>

      {presentation && (
        <div className="disclosure-receipt-verify-result">
          <div className="record-header">
            <div className="record-header__badges">
              <ProtocolBadge variant={presentation.badgeVariant}>
                {presentation.badge}
              </ProtocolBadge>
            </div>
          </div>

          <StatusCard
            variant={presentation.statusVariant}
            title={presentation.headline}
            body={presentation.body}
          />

          {errorMessage && (
            <div className="alert-banner alert-banner--error" role="alert">
              {errorMessage}
            </div>
          )}
        </div>
      )}

      {showTechnicalDetails && (
        <GlassPanel title="Technical details">
          <details className="disclosure-receipt-verify-details">
            <summary>Show Technical Details</summary>
            <div className="proof-grid">
              <ProofField label="Receipt ID" value={result.receipt.receipt_id} mono />
              <ProofField label="Receipt hash" value={result.receipt.receipt_hash} mono />
              <ProofField
                label="Created"
                value={formatDisclosureTimestamp(result.receipt.created_at)}
              />
              <ProofField
                label="Scope type"
                value={formatDisclosureScopeType(result.receipt.scope_type)}
              />
              <ProofField label="Result" value={result.receipt.result} />
              <ProofField
                label="Disclosure digest"
                value={truncateDisclosureHash(result.receipt.disclosure_digest)}
                mono
              />
              <ProofField
                label="Policy snapshot hash"
                value={truncateDisclosureHash(result.receipt.policy_snapshot_hash)}
                mono
              />
              <ProofField
                label="Custody snapshot hash"
                value={truncateDisclosureHash(result.receipt.custody_snapshot_hash)}
                mono
              />
              <ProofField label="Event ref" value={result.receipt.event_ref} mono />
              <ProofField
                label="Event chain verified"
                value={result.chain?.verified ? "Yes" : "No"}
              />
              <ProofField
                label="Event chain count"
                value={String(result.chain?.event_count ?? "—")}
              />
            </div>
          </details>
        </GlassPanel>
      )}
    </PageShell>
  );
}

export default function VerifyReceiptPage() {
  return (
    <Suspense
      fallback={
        <PageShell
          narrow
          heroAlign="left"
          badge="Check Proof"
          title="Check a ProofOrigin receipt"
          subtitle="Loading proof check…"
        />
      }
    >
      <VerifyReceiptContent />
    </Suspense>
  );
}
