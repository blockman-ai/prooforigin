"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GlassPanel from "../../../components/protocol/GlassPanel";
import PageShell from "../../../components/protocol/PageShell";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import {
  buildAccessCountMeter,
  deriveGrantDisplayStatus,
  formatOwnerGrantType,
  formatOwnerScopeType,
  formatOwnerTimestamp,
  grantStatusBadgeVariant,
  listOwnerDisclosureGrants,
  summarizeDisclosureGrants,
} from "../../lib/disclosureOwnerClient";

function SummaryPill({ label, value, variant = "neutral" }) {
  return (
    <span className={`custody-pill custody-pill--${variant}`.trim()}>
      {label}: {value}
    </span>
  );
}

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

export default function VaultDisclosureListPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [grants, setGrants] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadGrants() {
      setLoading(true);
      setError("");

      try {
        const result = await listOwnerDisclosureGrants();
        if (!result.ok) {
          throw new Error(result.error || "Unable to load disclosure grants.");
        }
        if (!cancelled) {
          setGrants(result.grants);
        }
      } catch (err) {
        if (!cancelled) {
          setGrants([]);
          setError(err.message || "Unable to load disclosure grants.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadGrants();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => summarizeDisclosureGrants(grants), [grants]);

  const heroHeadline =
    summary.total === 0
      ? "No disclosure grants yet."
      : `${summary.active} active grant${summary.active === 1 ? "" : "s"} ready for recipient access.`;

  return (
    <PageShell
      narrow
      badge="Vault Disclosure"
      title="Disclosure grants"
      subtitle="Review owner-authorized disclosure grants, access usage, and recipient activity."
      className="disclosure-owner-page"
      heroAlign="left"
    >
      <div className="protocol-actions">
        <Link href="/vault" className="secondary">
          Back to vault
        </Link>
      </div>

      {loading && (
        <div className="alert-banner alert-banner--warning" role="status">
          Loading disclosure grants…
        </div>
      )}

      {error && !loading && (
        <div className="alert-banner alert-banner--error" role="alert">
          <strong>Disclosure dashboard unavailable</strong>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="custody-trust-hero custody-trust-hero--success" aria-label="Disclosure summary">
            <div className="custody-trust-hero__content">
              <p className="custody-trust-hero__eyebrow">Owner disclosure</p>
              <h2 className="custody-trust-hero__headline">{heroHeadline}</h2>
              <p className="custody-trust-hero__issue">
                Track grant status, access counts, receipts, and event chains from one place.
              </p>
            </div>
            <div className="custody-trust-hero__meta disclosure-owner-summary">
              <SummaryPill label="Total" value={summary.total} />
              <SummaryPill label="Active" value={summary.active} variant="success" />
              <SummaryPill label="Receipted" value={summary.receipted} variant="success" />
              <SummaryPill label="Expiring soon" value={summary.expiringSoon} variant="warning" />
              <SummaryPill label="Revoked" value={summary.revoked} variant="warning" />
            </div>
          </section>

          <div className="record-list">
            {grants.length ? (
              grants.map((grant) => {
                const displayStatus = deriveGrantDisplayStatus(grant);
                return (
                  <GlassPanel key={grant.grant_id} className="record-list__item">
                    <div className="record-list__header">
                      <strong className="record-list__title">
                        {grant.purpose_label || "Disclosure grant"}
                      </strong>
                      <ProtocolBadge variant={grantStatusBadgeVariant(displayStatus)}>
                        {displayStatus}
                      </ProtocolBadge>
                    </div>

                    <p className="record-list__meta">
                      {formatOwnerGrantType(grant.grant_type)}
                      {grant.scope_type ? ` · ${formatOwnerScopeType(grant.scope_type)}` : ""}
                    </p>
                    <p className="record-list__meta">
                      Created {formatOwnerTimestamp(grant.created_at)} · Expires{" "}
                      {formatOwnerTimestamp(grant.expires_at)}
                    </p>

                    <AccessCountMeter
                      accessCount={grant.access_count}
                      maxAccessCount={grant.max_access_count}
                    />

                    <Link
                      href={`/vault/disclosure/${encodeURIComponent(grant.grant_id)}`}
                      className="secondary record-list__link"
                    >
                      View grant details
                    </Link>
                  </GlassPanel>
                );
              })
            ) : (
              <GlassPanel title="No disclosure grants yet">
                <p className="record-list__empty">
                  Grants created for this vault will appear here with access counts, receipts, and
                  event chains.
                </p>
              </GlassPanel>
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}
