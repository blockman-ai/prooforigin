export default function Home() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "white",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem",
      fontFamily: "Arial, sans-serif",
      textAlign: "center"
    }}>
      <div style={{ maxWidth: "900px" }}>
        <h1 style={{
          fontSize: "4rem",
          fontWeight: "bold",
          marginBottom: "1rem"
        }}>
          ProofOrigin
        </h1>

        <p style={{
          fontSize: "1.5rem",
          color: "#a0a0a0",
          marginBottom: "2rem"
        }}>
          Prove what’s real.
        </p>

        <p style={{
          fontSize: "1.1rem",
          lineHeight: "1.8",
          marginBottom: "3rem"
        }}>
          Bitcoin-backed proof of authenticity for digital content
          in the age of AI.
        </p>

        <div style={{
          display: "flex",
          gap: "1rem",
          justifyContent: "center",
          flexWrap: "wrap"
        }}>
          <a
            href="mailto:hello@prooforigin.org"
            style={{
              background: "#f7931a",
              color: "white",
              padding: "14px 28px",
              borderRadius: "10px",
              textDecoration: "none",
              fontWeight: "bold"
            }}
          >
            Join the Waitlist
          </a>

          <a
            href="#"
            style={{
              border: "1px solid #333",
              color: "white",
              padding: "14px 28px",
              borderRadius: "10px",
              textDecoration: "none",
              fontWeight: "bold"
            }}
          >
            Learn More
          </a>
        </div>
      </div>
    </main>
  );
}
