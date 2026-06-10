export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <div className="badge">
          Protocol Evaluation • Evidence Records
        </div>

        <h1>ProofOrigin</h1>

        <h2>
          Create a verifiable evaluation record for digital media.
        </h2>

        <p>
          ProofOrigin archives structural evidence, system confidence, and
          protocol context—not absolute truth.
        </p>

        <div className="buttons">
          <a
            href="https://tally.so/r/vGJQYX"
            target="_blank"
            rel="noopener noreferrer"
            className="primary"
          >
            Join the Waitlist
          </a>

          <a href="/detect" className="secondary">
            Try the Detector
          </a>

          <a href="/dog-game" className="game-button">
            🚀 DOG BOOST Flight
          </a>

          <a href="/snake-boost" className="game-button">
            🐍 Snake BOOST
          </a>
        </div>
      </section>

      <section id="how-it-works" className="cards">
        <div className="card">
          <h3>1. Upload Content</h3>
          <p>
            Submit media for protocol-scoped evaluation and record creation.
          </p>
        </div>

        <div className="card">
          <h3>2. Run Evaluation</h3>
          <p>
            ProofOrigin collects engine signals, metadata clues, and protocol
            context within defined claim boundaries.
          </p>
        </div>

        <div className="card">
          <h3>3. Get a Record</h3>
          <p>
            Receive a public evaluation record with notices—not a definitive
            truth verdict.
          </p>
        </div>
      </section>

      <section className="mission">
        <h2>Built for the age of synthetic media.</h2>

        <p>
          As AI content becomes harder to recognize, ProofOrigin helps creators,
          businesses, educators, and everyday users document what evaluation
          evidence exists—without overclaiming certainty.
        </p>
      </section>
    </main>
  );
}
