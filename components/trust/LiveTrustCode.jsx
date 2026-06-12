import TrustRing from "./TrustRing";
import ProofOriginSeal from "./ProofOriginSeal";

export default function LiveTrustCode({
  code,
  secondsLeft,
  windowSeconds,
  variant = "holder",
}) {
  const progress = windowSeconds ? secondsLeft / windowSeconds : 0;

  return (
    <div className={`trust-live-code trust-live-code--${variant}`}>
      <div className="trust-live-code__header">
        <ProofOriginSeal size={32} />
        <div>
          <p className="trust-live-code__eyebrow">Live Trust Code</p>
          <p className="trust-live-code__hint">Refreshes every {windowSeconds}s</p>
        </div>
        <TrustRing progress={progress} size={56} label="Code refresh countdown">
          <span className="trust-live-code__countdown">{secondsLeft}</span>
        </TrustRing>
      </div>
      <p className="trust-live-code__value" aria-live="polite">
        {code}
      </p>
      <p className="trust-live-code__footer">
        Ask verifiers to confirm this code in real time — screenshots are not proof.
      </p>
    </div>
  );
}
