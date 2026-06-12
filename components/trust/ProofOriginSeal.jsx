export default function ProofOriginSeal({ size = 48, className = "" }) {
  return (
    <svg
      className={`trust-seal ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="30" stroke="url(#trustSealRing)" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="22" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <path
        d="M32 14 L38 26 L50 28 L41 37 L43 49 L32 43 L21 49 L23 37 L14 28 L26 26 Z"
        fill="url(#trustSealFill)"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="0.75"
      />
      <text
        x="32"
        y="36"
        textAnchor="middle"
        fill="rgba(255,255,255,0.92)"
        fontSize="11"
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
        letterSpacing="0.06em"
      >
        PO
      </text>
      <defs>
        <linearGradient id="trustSealRing" x1="8" y1="8" x2="56" y2="56">
          <stop offset="0%" stopColor="#c8d4e0" />
          <stop offset="45%" stopColor="#00e5ff" />
          <stop offset="100%" stopColor="#8899aa" />
        </linearGradient>
        <linearGradient id="trustSealFill" x1="14" y1="14" x2="50" y2="50">
          <stop offset="0%" stopColor="rgba(200,212,224,0.35)" />
          <stop offset="100%" stopColor="rgba(0,229,255,0.12)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
