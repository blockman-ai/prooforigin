export default function ProtocolBadge({
  children,
  variant = "default",
  className = "",
}) {
  return (
    <span className={`protocol-badge protocol-badge--${variant} ${className}`.trim()}>
      {children}
    </span>
  );
}
