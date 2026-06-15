import GlassPanel from "../components/protocol/GlassPanel";
import PageShell from "../components/protocol/PageShell";

const PLATFORM_FLOW = [
  {
    label: "Identity",
    description: "Trust Pass and optional identity signals establish who controls the experience.",
  },
  {
    label: "Ownership",
    description: "Verified vault authority proves the owner, device, and intent before sensitive actions.",
  },
  {
    label: "Custody",
    description: "The vault tracks what exists, where it lives, and which devices can access it.",
  },
  {
    label: "Disclosure",
    description: "Owner-approved grants reveal only a specific proof, claim, or limited representation.",
  },
  {
    label: "Sentinel",
    description: "Metadata-only monitoring watches custody risk without inspecting documents.",
  },
];

const CUSTODY_FEATURES = [
  {
    title: "Custody Map",
    description: "A clear view of devices, documents, protection status, and what needs attention.",
  },
  {
    title: "Custody Timeline",
    description: "Readable history for ownership, transfers, cleanup, retirement, and recent activity.",
  },
];

const SENTINEL_POINTS = [
  "Watches custody state, access patterns, and attention signals.",
  "Uses metadata and event history, not document inspection.",
  "Surfaces review-needed states before trust drift becomes invisible.",
];

const START_ACTIONS = [
  {
    title: "Open Vault",
    href: "/vault",
  },
  {
    title: "View Trust Pass",
    href: "/identity-card",
  },
];

export default function Home() {
  return (
    <PageShell
      className="home-page"
      badge="Zero-Knowledge Trust Platform • Beta"
      title="Prove ownership. Control custody. Disclose safely."
      subtitle="ProofOrigin is a zero-knowledge trust platform for identity, custody, and controlled disclosure."
    >
      <div className="hero-cta-row">
        <a href="/vault" className="primary hero-cta-row__primary">
          Open Vault
        </a>
        <a href="/identity-card" className="secondary">
          View Trust Pass
        </a>
      </div>

      <section className="platform-flow" aria-label="ProofOrigin platform flow">
        <header className="home-section__header">
          <h2 className="home-section__title">The trust platform</h2>
          <p className="home-section__lead">
            ProofOrigin connects identity, ownership, custody, disclosure, and Sentinel into one
            private trust layer.
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
          title="What you own, where it lives, and what changed."
        >
          <p className="home-custody-section__copy">
            Custody Map turns the vault into a trust surface: your devices, documents, protection
            status, and attention items in one readable place. Custody Timeline shows the history
            behind that trust, including ownership verification, transfers, cleanup, and retirement.
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
            <a href="/custody-map" className="secondary">
              Open Custody Map
            </a>
          </div>
        </GlassPanel>
      </section>

      <section id="sentinel" className="home-sentinel-section" aria-label="Sentinel monitoring">
        <GlassPanel className="home-panel" title="Sentinel monitors trust without reading documents.">
          <p className="home-sentinel-section__copy">
            Sentinel watches metadata, custody state, and event patterns. It does not inspect your
            documents, labels, vault keys, recovery material, or private content.
          </p>
          <ul className="home-sentinel-section__list">
            {SENTINEL_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </GlassPanel>
      </section>

      <section
        id="disclosure"
        className="home-disclosure-section"
        aria-label="Controlled Disclosure"
      >
        <GlassPanel className="home-panel" title="Controlled Disclosure">
          <p className="home-disclosure-section__eyebrow">Coming Soon</p>
          <p className="home-disclosure-section__copy">
            Verify claims without transferring ownership. Controlled Disclosure will let owners
            create time-bound, auditable grants that reveal only the proof or claim needed, not the
            whole vault and not custody.
          </p>
        </GlassPanel>
      </section>

      <section className="home-beta-notice" aria-label="Beta notice">
        <GlassPanel className="home-panel" title="Beta boundaries">
          <p className="home-beta-notice__copy">
            ProofOrigin is trust infrastructure in careful beta. It is not a government ID or
            absolute truth verification. If you lose your device and recovery kit, we cannot
            restore access. That is intentional zero-knowledge design.
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
