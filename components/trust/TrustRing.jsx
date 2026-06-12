export default function TrustRing({
  progress = 1,
  size = 120,
  children,
  className = "",
  label = "Dynamic Trust Ring",
}) {
  const stroke = 3;
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <div
      className={`trust-ring ${className}`.trim()}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg className="trust-ring__svg" width={size} height={size} aria-hidden="true">
        <circle
          className="trust-ring__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className="trust-ring__progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="trust-ring__inner">{children}</div>
    </div>
  );
}
