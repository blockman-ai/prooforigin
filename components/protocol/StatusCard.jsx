const VARIANTS = {
  anchored: {
    title: "Registered ProofOrigin Protocol Record Matched",
    body: "Structural protocol metadata is present for this upload record.",
  },
  unanchored: {
    title: "Unanchored Protocol Record",
    body: "This upload is registered, but protocol anchoring fields are missing. No credential link should be inferred until evaluation metadata is complete.",
  },
  success: {
    title: "Proof Record Created",
    body: "Your protocol evaluation record is ready to view.",
  },
  warning: {
    title: "Partial Record Created",
    body: "The upload was saved, but protocol evaluation metadata could not be attached.",
  },
  error: {
    title: "Something Went Wrong",
    body: "",
  },
  info: {
    title: "",
    body: "",
  },
  pending: {
    title: "Evaluation Pending",
    body: "Protocol evaluation metadata has not been recorded yet.",
  },
};

export default function StatusCard({
  variant = "info",
  title,
  body,
  children,
  className = "",
}) {
  const preset = VARIANTS[variant] || VARIANTS.info;

  return (
    <div className={`status-card status-card--${variant} ${className}`.trim()}>
      {(title || preset.title) && (
        <h2 className="status-card__title">{title || preset.title}</h2>
      )}
      {(body || preset.body) && (
        <p className="status-card__body">{body || preset.body}</p>
      )}
      {children}
    </div>
  );
}
