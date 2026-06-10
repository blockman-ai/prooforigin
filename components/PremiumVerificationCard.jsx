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
        Protocol Evaluation Record
      </p>

      <ul style={{ margin: 0, paddingLeft: "20px" }}>
        <li>Evaluation state recorded under Proof-of-Origin protocol</li>
        <li>Evidence bundle reference may be attached to this record</li>
        <li>Protocol-scoped analysis completed</li>
        <li>Does not verify absolute truth</li>
      </ul>
    </div>
  );
}
