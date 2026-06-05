export default function PremiumVerificationCard() {
  return (
    <div
      style={{
        padding: "20px",
        borderRadius: "16px",
        border: "1px solid rgba(0,229,255,.25)",
        background: "rgba(0,229,255,.05)",
        marginBottom: "20px",
      }}
    >
      <p
        style={{
          color: "#00e5ff",
          fontWeight: "bold",
          marginBottom: "12px",
        }}
      >
        VERIFIED EVIDENCE RECORD
      </p>

      <ul style={{ margin: 0, paddingLeft: "20px" }}>
        <li>SHA-256 Hash Recorded</li>
        <li>Evidence ID Issued</li>
        <li>Consensus Analysis Complete</li>
        <li>Public Verification Available</li>
      </ul>
    </div>
  );
}
