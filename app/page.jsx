import FeatureCard from "../components/protocol/FeatureCard";
import GlassPanel from "../components/protocol/GlassPanel";
import PageShell from "../components/protocol/PageShell";

const TRUST_STACK = [
  {
    name: "Trust Pass",
    role: "Identity",
    description: "Rotating verification codes and public trust history — not a government ID.",
    accent: "cyan",
  },
  {
    name: "Voice Anchor",
    role: "Authenticity",
    description: "Optional private voice fingerprint hash to document your real voice.",
    accent: "violet",
  },
  {
    name: "Vault",
    role: "Custody",
    description: "Zero-knowledge encrypted documents — keys stay on your device.",
    accent: "mint",
  },
  {
    name: "Guide",
    role: "Understanding",
    description: "Safe answers about vault unlock, passkeys, and recovery.",
    accent: "cyan",
  },
  {
    name: "Sentinel",
    role: "Protection",
    description: "Platform integrity monitoring for ops — never accesses your secrets.",
    accent: "violet",
  },
];

const START_HERE = [
  {
    step: "01",
    title: "Create Trust Pass",
    description: "Generate a live verification pass for chats, communities, and online trust.",
    href: "/identity-card",
    accent: "cyan",
  },
  {
    step: "02",
    title: "Open Private Vault",
    description: "Set up your encrypted vault for documents and trust assets.",
    href: "/vault",
    accent: "violet",
  },
  {
    step: "03",
    title: "Save Recovery Kit",
    description: "Export your recovery kit inside the vault — required for device loss.",
    href: "/vault",
    accent: "mint",
  },
];

export default function Home() {
  return (
    <PageShell
      badge="Personal Trust Infrastructure • Beta"
      title="Verify identity. Protect documents. Stay in control."
      subtitle="Trust Pass, Private Vault, Recovery Kit, Guide, and Sentinel — built around zero-knowledge principles."
    >
      <div className="hero-cta-row">
        <a href="/identity-card" className="primary hero-cta-row__primary">
          Create Trust Pass
        </a>
        <a href="/vault" className="secondary">
          Open Private Vault
        </a>
      </div>

      <section className="trust-stack" aria-label="The ProofOrigin trust stack">
        <header className="home-section__header">
          <h2 className="home-section__title">The trust stack</h2>
          <p className="home-section__lead">
            Five layers that work together — identity, authenticity, custody, understanding,
            and protection.
          </p>
        </header>
        <div className="trust-stack__grid">
          {TRUST_STACK.map((item) => (
            <article
              key={item.name}
              className={`feature-card feature-card--${item.accent} trust-stack__card`}
            >
              <p className="trust-stack__role">{item.role}</p>
              <h3 className="feature-card__title">{item.name}</h3>
              <p className="feature-card__body">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-start-here" aria-label="Start here">
        <header className="home-section__header">
          <h2 className="home-section__title">Start here</h2>
          <p className="home-section__lead">Three steps to get value in minutes.</p>
        </header>
        <div className="home-start-here__grid">
          {START_HERE.map((item) => (
            <FeatureCard
              key={item.step}
              step={item.step}
              title={item.title}
              description={item.description}
              accent={item.accent}
            />
          ))}
        </div>
        <div className="protocol-actions home-start-here__actions">
          <a href="/identity-card" className="primary">
            Create Trust Pass
          </a>
          <a href="/vault" className="secondary">
            Open Private Vault
          </a>
        </div>
      </section>

      <section className="home-guide-promo" aria-label="ProofOrigin Guide">
        <GlassPanel className="home-guide-promo__panel" title="Questions about passkeys, recovery, or vaults?">
          <p className="home-guide-promo__copy">
            Ask Guide from any page — safe, in-app help about unlock, Recovery Kit, and Trust
            Pass. Guide never asks for your PIN, recovery phrase, or vault keys.
          </p>
          <p className="home-guide-promo__hint">
            Use the <strong>Need help?</strong> button in the corner of this page.
          </p>
        </GlassPanel>
      </section>

      <section className="home-beta-notice" aria-label="Beta notice">
        <GlassPanel title="Honest beta boundaries">
          <p className="home-beta-notice__copy">
            ProofOrigin is personal trust infrastructure in cautious beta — not a government ID,
            not absolute truth verification, and not account recovery if you lose your device
            and recovery kit. Losing all three — device, PIN or passkey, and recovery kit — means
            permanent vault lockout by design.
          </p>
        </GlassPanel>
      </section>

      <section className="home-labs-link" aria-label="Labs">
        <p className="home-labs-link__copy">
          Researchers and experimenters: media provenance tools and protocol arcade live in{" "}
          <a href="/labs">Labs</a>.
        </p>
      </section>
    </PageShell>
  );
}
