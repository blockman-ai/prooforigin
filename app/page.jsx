export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <div className="badge">AI Content Detection • Authenticity Reports</div>

        <h1>ProofOrigin</h1>

        <h2>Find out if content was created by AI.</h2>

        <p>
          Upload images, videos, documents, or media files and receive a clear
          authenticity analysis showing whether content is likely human-made,
          AI-generated, or manipulated.
        </p>

        <div className="buttons">
          <a 
            href="https://tally.so/r/vGJQYX"
            target="_blank" 
            rel="noopener noreferrer" className="primary">
            Join the Waitlist
          </a>
          <a href="#how-it-works" className="secondary">
            How It Works
          </a>
        </div>
      </section>

      <section id="how-it-works" className="cards">
        <div className="card">
          <h3>1. Upload Content</h3>
          <p>Submit an image, video, document, or audio file for analysis.</p>
        </div>

        <div className="card">
          <h3>2. Run AI Detection</h3>
          <p>ProofOrigin checks for AI-generation signals, metadata clues, and manipulation risk.</p>
        </div>

        <div className="card">
          <h3>3. Get a Report</h3>
          <p>Receive a simple authenticity score with a clear explanation.</p>
        </div>
      </section>

      <section className="mission">
        <h2>Built for the age of synthetic media.</h2>
        <p>
          As AI content becomes harder to recognize, ProofOrigin helps creators,
          businesses, educators, and everyday users verify what they are looking at.
        </p>
      </section>
    </main>
  );
}
