export default function ProofField({ label, value, mono = false, className = "" }) {
  if (value == null || value === "") return null;

  return (
    <div className={`proof-field ${className}`.trim()}>
      <span className="proof-field__label">{label}</span>
      <span className={`proof-field__value ${mono ? "proof-field__value--mono" : ""}`.trim()}>
        {value}
      </span>
    </div>
  );
}
