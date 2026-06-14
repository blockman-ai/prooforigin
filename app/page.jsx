import FeatureCard from "../components/protocol/FeatureCard";
import GlassPanel from "../components/protocol/GlassPanel";
import PageShell from "../components/protocol/PageShell";

const TRUST_STACK = [
  {
    name: "Trust Pass",
    role: "Identity",
    description: "Rotating codes and public trust history. Not a government ID.",
    accent: "cyan",
  },
  {
    name: "Voice Anchor",
    role: "Authenticity",
    description: "Optional voice enrollment record to document an authenticity signal. Not live voice verification.",
    accent: "violet",
  },
  {
    name: "Vault",
    role: "Custody",
    description: "Encrypted documents with keys that never leave your device.",
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
    description: "Platform monitoring for operators. Never accesses your secrets.",
    accent: "violet",
  },
];

const START_HERE = [
  {
    step: "01",
    title: "Create Trust Pass",
    description: "Live trust signals for chats, communities, and online verification.",
    href: "/identity-card",
    accent: "cyan",
  },
  {
    step: "02",
    title: "Open Private Vault",
    description: "Encrypted storage for documents and trust assets.",
    href: "/vault",
    accent: "violet",
  },
  {
    step: "03",
    title: "Save Recovery Kit",
    description: "Export your kit in the vault before you rely on one device.",
    href: "/vault",
    accent: "mint",
  },
];

export default function Home() {
  return (
    <PageShell
      className="home-page"
      badge="Personal Trust Infrastructure • Beta"
      title="Prove you are the real you. Protect documents. Stay in control."
      subtitle="Trust Pass, Private Vault, Recovery Kit, Guide and Sentinel work together to keep your documents and trust history private, verifiable, and under your control. Not a government ID — not absolute identity verification."
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
            Five layers working together: identity, authenticity, custody, understanding, and
            protection.
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
          <p className="home-section__lead">Three steps to get started.</p>
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
        <GlassPanel
          className="home-guide-promo__panel home-panel"
          title="Questions about passkeys, recovery, or vaults?"
        >
          <p className="home-guide-promo__copy">
            Ask Guide on any page for safe help with unlock, Recovery Kit, and Trust Pass. Guide
            never asks for your PIN, recovery phrase, or vault keys.
          </p>
          <p className="home-guide-promo__hint">
            Tap <strong>Need help?</strong> in the corner.
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
          See how ProofOrigin applies in practice on the{" "}
          <a href="/use-cases">Use Cases</a> page. Media provenance tools and protocol arcade live
          in <a href="/labs">Labs</a>.
        </p>
      </section>
    </PageShell>
  );
}
