import FeatureCard from "../components/protocol/FeatureCard";
import GlassPanel from "../components/protocol/GlassPanel";
import PageShell from "../components/protocol/PageShell";

export default function Home() {
  return (
    <PageShell
      badge="Protocol Evaluation • Evidence Records"
      title="ProofOrigin"
      subtitle="Create verifiable evaluation records for digital media. Structural evidence and protocol context—not absolute truth."
    >
      <div className="hero-cta-row">
        <a href="/upload" className="primary hero-cta-row__primary">
          Create Proof Record
        </a>
        <a href="/detect" className="secondary">
          Run Live Detector
        </a>
        <a
          href="https://tally.so/r/vGJQYX"
          target="_blank"
          rel="noopener noreferrer"
          className="secondary"
        >
          Join Waitlist
        </a>
      </div>

      <section className="bento-grid" aria-label="How ProofOrigin works">
        <FeatureCard
          step="01"
          title="Upload Content"
          description="Submit media for protocol-scoped evaluation and durable record creation."
        />
        <FeatureCard
          step="02"
          title="Run Evaluation"
          description="Engine signals, metadata clues, and protocol context collected within defined claim boundaries."
          accent="violet"
        />
        <FeatureCard
          step="03"
          title="Get a Record"
          description="Receive a public evaluation record with notices—not a definitive truth verdict."
          accent="mint"
        />
        <GlassPanel className="bento-grid__mission" title="Built for synthetic media">
          <p className="bento-grid__mission-copy">
            As AI content becomes harder to recognize, ProofOrigin helps creators,
            businesses, and everyday users document what evaluation evidence
            exists—without overclaiming certainty.
          </p>
        </GlassPanel>
      </section>

      <section className="voice-promo" aria-label="Voice identity protection">
        <GlassPanel className="voice-promo__panel" title="Protect your voice identity">
          <p className="voice-promo__copy">
            AI voice clones are already used in phone scams and impersonation fraud.
            Voice Identity Anchor is ProofOrigin&apos;s first step toward helping people
            document and protect their real voice — starting with a private fingerprint
            hash, not a public recording.
          </p>
          <div className="protocol-actions voice-promo__actions">
            <a href="/voice-anchor" className="primary">
              Explore Voice Anchor V1
            </a>
          </div>
        </GlassPanel>
      </section>

      <section className="arcade-strip">
        <p className="arcade-strip__label">Protocol Arcade</p>
        <div className="protocol-actions arcade-strip__actions">
          <a href="/dog-game" className="game-button">
            DOG BOOST Flight
          </a>
          <a href="/snake-boost" className="game-button">
            Snake BOOST
          </a>
        </div>
      </section>
    </PageShell>
  );
}
