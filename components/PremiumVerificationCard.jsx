import GlassPanel from "./protocol/GlassPanel";
import ProtocolBadge from "./protocol/ProtocolBadge";

export default function PremiumVerificationCard() {
  return (
    <GlassPanel className="premium-verification-card-wrap">
      <ProtocolBadge>Protocol Evaluation Record</ProtocolBadge>
      <ul className="premium-checklist">
        <li>Evaluation state recorded under Proof-of-Origin protocol</li>
        <li>Evidence bundle reference may be attached to this record</li>
        <li>Protocol-scoped analysis completed</li>
        <li>Does not verify absolute truth</li>
      </ul>
    </GlassPanel>
  );
}
