import GlassPanel from "../components/protocol/GlassPanel";
import PageShell from "../components/protocol/PageShell";

export default function Home() {
  return (
    <PageShell
      badge="Protocol Evaluation • Evidence Records"
      title="ProofOrigin"
      subtitle="Create a verifiable evaluation record for digital media. ProofOrigin archives structural evidence, system confidence, and protocol context—not absolute truth."
    >
      <div className="protocol-actions" style={{ justifyContent: "center" }}>
        <a
          href="https://tally.so/r/vGJQYX"
          target="_blank"
          rel="noopener noreferrer"
          className="primary"
        >
          Join the Waitlist
        </a>
        <a href="/upload" className="secondary">
          Upload & Create Record
        </a>
        <a href="/detect" className="secondary">
          Try the Detector
        </a>
      </div>

      <section className="cards" style={{ marginTop: 36 }}>
        <GlassPanel title="1. Upload Content">
          <p style={{ margin: 0, color: "#b8c7dc", lineHeight: 1.55 }}>
            Submit media for protocol-scoped evaluation and record creation.
          </p>
        </GlassPanel>

        <GlassPanel title="2. Run Evaluation">
          <p style={{ margin: 0, color: "#b8c7dc", lineHeight: 1.55 }}>
            ProofOrigin collects engine signals, metadata clues, and protocol
            context within defined claim boundaries.
          </p>
        </GlassPanel>

        <GlassPanel title="3. Get a Record">
          <p style={{ margin: 0, color: "#b8c7dc", lineHeight: 1.55 }}>
            Receive a public evaluation record with notices—not a definitive
            truth verdict.
          </p>
        </GlassPanel>
      </section>

      <section className="mission">
        <h2>Built for the age of synthetic media.</h2>
        <p>
          As AI content becomes harder to recognize, ProofOrigin helps creators,
          businesses, educators, and everyday users document what evaluation
          evidence exists—without overclaiming certainty.
        </p>

        <div
          className="protocol-actions"
          style={{ justifyContent: "center", marginTop: 28 }}
        >
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
