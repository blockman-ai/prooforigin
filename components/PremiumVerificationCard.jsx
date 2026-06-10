import GlassPanel from "./protocol/GlassPanel";
import ProtocolBadge from "./protocol/ProtocolBadge";

const CHECKS = [
  "Evaluation state recorded under Proof-of-Origin protocol",
  "Evidence bundle reference may be attached to this record",
  "Protocol-scoped analysis completed",
  "Does not verify absolute truth",
];

export default function PremiumVerificationCard() {
  return (
    <GlassPanel className="premium-verification-card-wrap">
      <div className="premium-card-header">
        <ProtocolBadge>Protocol Evaluation Record</ProtocolBadge>
        <p className="premium-card-header__copy">
          Structural metadata only — not a truth verdict.
        </p>
      </div>
      <ul className="premium-checklist">
        {CHECKS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </GlassPanel>
  );
}
