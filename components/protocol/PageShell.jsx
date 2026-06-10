import ProtocolBadge from "./ProtocolBadge";

export default function PageShell({
  badge,
  title,
  subtitle,
  children,
  className = "",
  narrow = false,
}) {
  return (
    <main className={`protocol-page ${className}`.trim()}>
      <section className={`protocol-shell ${narrow ? "protocol-shell--narrow" : ""}`.trim()}>
        <header className="protocol-hero">
          {badge && <ProtocolBadge>{badge}</ProtocolBadge>}
          {title && <h1 className="protocol-hero__title">{title}</h1>}
          {subtitle && <p className="protocol-hero__subtitle">{subtitle}</p>}
        </header>
        {children}
      </section>
    </main>
  );
}
