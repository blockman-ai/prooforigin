import GlassPanel from "../components/protocol/GlassPanel";
import PageShell from "../components/protocol/PageShell";

const PLATFORM_FLOW = [
  {
    label: "Register",
    description: "Create a certificate for a PSA card, memorabilia, artwork, document, or other asset.",
  },
  {
    label: "Certificate",
    description: "Share a public certificate that shows provenance, custody, and protected-since history.",
  },
  {
    label: "Track",
    description: "Use the custody timeline to understand what happened, when, and who accepted each handoff.",
  },
  {
    label: "Transfer",
    description: "Move custody to another owner with a receipt-backed, two-party acceptance flow.",
  },
  {
    label: "Protect",
    description: "Account & Security keeps owner keys, devices, and recovery controls out of the public story.",
  },
];

const CUSTODY_FEATURES = [
  {
    title: "Certificate",
    description: "A public page for each asset with provenance, current custody, and a plain-English trust summary.",
  },
  {
    title: "Custody Timeline",
    description: "Readable ownership history for registration, verification, transfers, sharing, and retirement.",
  },
];

const SENTINEL_POINTS = [
  "PSA cards, memorabilia, artwork, and documents get a shareable certificate.",
  "Transfers update the ownership history without exposing private identities.",
  "Technical evidence remains available without overwhelming the first view.",
];

const START_ACTIONS = [
  {
    title: "Register an asset",
    href: "/assets/register",
  },
  {
    title: "Open your collection",
    href: "/assets",
  },
];

export default function Home() {
  return (
    <PageShell
      className="home-page"
      badge="Asset Provenance • Beta"
      title="Prove what you own. Share proof in one link."
      subtitle="ProofOrigin verifies provenance, custody, and ownership history for digital and physical assets."
    >
      <div className="hero-cta-row">
        <a href="/assets/register" className="primary hero-cta-row__primary">
          Register Asset
        </a>
        <a href="/verify/receipt" className="secondary">
          Check Proof
        </a>
      </div>

      <section className="platform-flow" aria-label="ProofOrigin platform flow">
        <header className="home-section__header">
          <h2 className="home-section__title">The asset trust layer</h2>
          <p className="home-section__lead">
            Start with a registered asset, then let the certificate and custody timeline explain
            the history to anyone you share it with.
          </p>
        </header>
        <div className="platform-flow__rail">
          {PLATFORM_FLOW.map((item, index) => (
            <article key={item.label} className="platform-flow__item">
              <span className="platform-flow__step">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{item.label}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="custody" className="home-custody-section" aria-label="Custody Map and Timeline">
        <GlassPanel
          className="home-panel home-custody-section__panel"
          title="Certificates and custody history, not another storage dashboard."
        >
          <p className="home-custody-section__copy">
            ProofOrigin turns each asset into a certificate with a custody timeline: registration,
            verification, transfers, and ownership history in one readable place.
          </p>
          <div className="home-custody-section__grid">
            {CUSTODY_FEATURES.map((feature) => (
              <article key={feature.title} className="home-mini-card">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
          <div className="protocol-actions home-custody-section__actions">
            <a href="/assets" className="secondary">
              Open Collection
            </a>
          </div>
        </GlassPanel>
      </section>

      <section id="asset-story" className="home-sentinel-section" aria-label="Asset story">
        <GlassPanel className="home-panel" title="Built for assets people already care about.">
          <p className="home-sentinel-section__copy">
            The first experience is simple: register the asset, share the certificate, and let the
            custody timeline show what changed over time.
          </p>
          <ul className="home-sentinel-section__list">
            {SENTINEL_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </GlassPanel>
      </section>

      <section
        id="sharing"
        className="home-disclosure-section"
        aria-label="Private sharing"
      >
        <GlassPanel className="home-panel" title="Share proof without oversharing.">
          <p className="home-disclosure-section__eyebrow">Private by design</p>
          <p className="home-disclosure-section__copy">
            Public certificates show the asset story. Account & Security keeps keys, recovery,
            private evidence, and advanced details away from the primary public experience.
          </p>
        </GlassPanel>
      </section>

      <section className="home-beta-notice" aria-label="Beta notice">
        <GlassPanel className="home-panel" title="Beta boundaries">
          <p className="home-beta-notice__copy">
            ProofOrigin records provenance and custody signals. It is not an appraisal, insurance
            valuation, government ID, or legal title transfer.
          </p>
        </GlassPanel>
      </section>

      <section className="home-labs-link" aria-label="More to explore">
        <p className="home-labs-link__copy">
          Start with{" "}
          {START_ACTIONS.map((action, index) => (
            <span key={action.href}>
              <a href={action.href}>{action.title}</a>
              {index === START_ACTIONS.length - 1 ? "." : " or "}
            </span>
          ))}{" "}
          See practical scenarios on the <a href="/use-cases">Use Cases</a> page.
        </p>
      </section>
    </PageShell>
  );
}
