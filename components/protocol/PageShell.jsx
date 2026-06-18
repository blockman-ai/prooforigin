import ProtocolBadge from "./ProtocolBadge";
import SiteFooter from "./SiteFooter";
import SiteNav from "./SiteNav";

export default function PageShell({
  badge,
  title,
  subtitle,
  children,
  className = "",
  narrow = false,
  heroAlign = "center",
}) {
  return (
    <div className="protocol-app protocol-app--premium">
      <div className="protocol-app__ambient" aria-hidden="true">
        <span className="protocol-orb protocol-orb--cyan" />
        <span className="protocol-orb protocol-orb--violet" />
        <span className="protocol-orb protocol-orb--gold" />
      </div>

      <SiteNav />

      <main className={`protocol-page ${className}`.trim()}>
        <section
          className={`protocol-shell ${narrow ? "protocol-shell--narrow" : ""}`.trim()}
        >
          <header className={`protocol-hero protocol-hero--${heroAlign}`}>
            {badge && <ProtocolBadge>{badge}</ProtocolBadge>}
            {title && (
              <h1 className="protocol-hero__title protocol-hero__title--gradient">
                {title}
              </h1>
            )}
            {subtitle && <p className="protocol-hero__subtitle">{subtitle}</p>}
          </header>
          {children}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
