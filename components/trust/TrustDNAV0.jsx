import { formatCardDate } from "../../app/lib/identityCardShared";

function computeIdentityAgeDays(issuedAt) {
  if (!issuedAt) return 0;
  const ms = Date.now() - new Date(issuedAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function formatIdentityAge(issuedAt) {
  const days = computeIdentityAgeDays(issuedAt);
  if (days === 0) return "New";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month" : `${months} months`;
}

export default function TrustDNAV0({
  issuedAt,
  verificationCount = 0,
  historyCount = 0,
  voiceAnchorStatus = "Not enrolled",
  voiceAnchorDetail = "Optional documentation signal",
}) {
  const metrics = [
    {
      label: "Identity Age",
      value: formatIdentityAge(issuedAt),
      detail: issuedAt ? `Since ${formatCardDate(issuedAt)}` : "—",
    },
    {
      label: "Voice Anchor",
      value: voiceAnchorStatus,
      detail: voiceAnchorDetail,
    },
    {
      label: "Verification Events",
      value: String(verificationCount),
      detail: "Server-recorded verifications",
    },
    {
      label: "Trust History",
      value: String(historyCount),
      detail: "Append-only state events",
    },
    {
      label: "Bitcoin Anchor Status",
      value: "Coming Soon",
      detail: "OpenTimestamps integration planned",
      muted: true,
    },
  ];

  return (
    <section className="trust-dna" aria-label="TrustDNA V0 preview">
      <header className="trust-dna__header">
        <p className="trust-dna__eyebrow">TrustDNA V0</p>
        <h3 className="trust-dna__title">Trust signal preview</h3>
        <p className="trust-dna__subtitle">
          Visual framework only — no scoring yet. Trust is built through history,
          verification, and proof.
        </p>
      </header>
      <ul className="trust-dna__grid">
        {metrics.map((metric) => (
          <li
            key={metric.label}
            className={`trust-dna__cell ${metric.muted ? "trust-dna__cell--muted" : ""}`.trim()}
          >
            <span className="trust-dna__label">{metric.label}</span>
            <span className="trust-dna__value">{metric.value}</span>
            <span className="trust-dna__detail">{metric.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
