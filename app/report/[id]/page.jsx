export default async function ReportPage({ params }) {
  const { id } = await params;

  return (
    <main className="page">
      <section className="hero">
        <div className="badge">
          Public Authenticity Report
        </div>

        <h1>ProofOrigin Report</h1>

        <div className="report-card">
          <h2>Report ID</h2>
          <p>{id}</p>

          <div className="game-stats compact-stats">
            <div>
              <span>AI Probability</span>
              <strong>82%</strong>
            </div>

            <div>
              <span>Human Probability</span>
              <strong>18%</strong>
            </div>

            <div>
              <span>Status</span>
              <strong>AI</strong>
            </div>

            <div>
              <span>Engine</span>
              <strong>v1</strong>
            </div>
          </div>

          <p style={{ marginTop: 24 }}>
            This content shows indicators commonly associated
            with synthetic AI-generated media.
          </p>
        </div>
      </section>
    </main>
  );
}
