import GlassPanel from "../../components/protocol/GlassPanel";
import PageShell from "../../components/protocol/PageShell";

const AVAILABLE_NOW = [
  {
    title: "Online Trust Pass",
    description:
      "Use for chats, communities, creator profiles, marketplaces, and public verification links.",
    accent: "cyan",
  },
  {
    title: "Private Vault",
    description:
      "Store encrypted trust documents and sensitive records with client-side keys.",
    accent: "violet",
  },
  {
    title: "Recovery Kit",
    description:
      "Export a recovery kit and restore vault identity on a new device with the restore wizard. Document migration is a future phase.",
    accent: "mint",
  },
  {
    title: "Guide",
    description:
      "Safe in-app help for passkeys, vault unlock, recovery and Trust Pass.",
    accent: "cyan",
  },
  {
    title: "Sentinel",
    description:
      "Platform monitoring for abuse, storage drift, auth probing and operational health. Ops-only and never accesses secrets.",
    accent: "violet",
  },
];

const NEAR_FUTURE = [
  {
    title: "Cross-device document migration",
    description: "Re-home encrypted vault documents after identity restore on a new device.",
    accent: "mint",
  },
  {
    title: "Trust Pass + Voice Anchor",
    description: "Link optional voice authenticity proof to a Trust Pass.",
    accent: "cyan",
  },
  {
    title: "Developer Verify API",
    description:
      "Let apps verify ProofOrigin Trust Pass status with rate-limited API keys.",
    accent: "violet",
  },
  {
    title: "Knowledge Layer",
    description:
      "Better Guide and Sentinel answers from versioned architecture docs and runbooks.",
    accent: "mint",
  },
];

const FUTURE_POSSIBILITIES = [
  {
    title: "Sign in with ProofOrigin",
    description: "Portable trust login without exposing vault contents.",
    accent: "cyan",
  },
  {
    title: "Business / Team Trust",
    description:
      "Staff identity, role trust, customer verification and audit trails.",
    accent: "violet",
  },
  {
    title: "Creator Authenticity",
    description: "Help creators prove official accounts and reduce impersonation.",
    accent: "mint",
  },
  {
    title: "Elder Fraud Protection",
    description:
      "Family-safe verification prompts for suspicious messages or money requests.",
    accent: "cyan",
  },
  {
    title: "Marketplace Trust",
    description:
      "Verify sellers, buyers, and transaction context before high-risk deals.",
    accent: "violet",
  },
  {
    title: "Healthcare / Care Coordination",
    description:
      "Verify transport staff, caregivers, consent records, and handoff trust history. Not a medical record system.",
    accent: "mint",
  },
  {
    title: "Legal / Dispute Evidence",
    description:
      "Preserve proof records and trust history for review. Not a guarantee of legal outcome.",
    accent: "cyan",
  },
  {
    title: "AI Content Provenance Labs",
    description:
      "Media evaluation tools live in Labs, not the core homepage.",
    accent: "violet",
  },
];

const BOUNDARIES = [
  "Not a government ID",
  "Not absolute truth verification",
  "Not a bank or payment system",
  "Not account recovery if you lose device, PIN/passkey and Recovery Kit",
  "Not a replacement for legal, medical or financial advice",
];

function UseCaseCard({ title, description, accent, phase }) {
  return (
    <article
      className={`feature-card feature-card--${accent} use-cases-card use-cases-card--${phase}`}
    >
      <h3 className="feature-card__title">{title}</h3>
      <p className="feature-card__body">{description}</p>
    </article>
  );
}

function UseCaseSection({ id, title, lead, items, phase }) {
  return (
    <section className="use-cases-section" aria-labelledby={id}>
      <header className="home-section__header">
        <h2 className="home-section__title" id={id}>
          {title}
        </h2>
        {lead && <p className="home-section__lead">{lead}</p>}
      </header>
      <div className="use-cases-grid">
        {items.map((item) => (
          <UseCaseCard key={item.title} {...item} phase={phase} />
        ))}
      </div>
    </section>
  );
}

export const metadata = {
  title: "Use Cases | ProofOrigin",
  description:
    "How ProofOrigin applies to identity, custody, recovery, and trust verification today and in the roadmap ahead.",
};

export default function UseCasesPage() {
  return (
    <PageShell
      className="use-cases-page"
      badge="Use Cases • Trust Infrastructure"
      title="Use cases for personal trust infrastructure"
      subtitle="ProofOrigin helps people build trust signals, protect important records, and stay in control without giving up private keys, vault contents, or recovery secrets. Not a government ID — not absolute identity verification."
    >
      <div className="hero-cta-row">
        <a href="/identity-card" className="primary hero-cta-row__primary">
          Create Trust Pass
        </a>
        <a href="/vault" className="secondary">
          Open Private Vault
        </a>
      </div>

      <UseCaseSection
        id="use-cases-available"
        title="Available now"
        lead="Core trust stack features you can use today."
        items={AVAILABLE_NOW}
        phase="available"
      />

      <UseCaseSection
        id="use-cases-near-future"
        title="Near future"
        lead="Active roadmap items building on the current stack."
        items={NEAR_FUTURE}
        phase="near"
      />

      <UseCaseSection
        id="use-cases-future"
        title="Future possibilities"
        lead="Directions under exploration. Not commitments or launch dates."
        items={FUTURE_POSSIBILITIES}
        phase="future"
      />

      <section className="use-cases-section" aria-labelledby="use-cases-boundaries">
        <GlassPanel className="home-panel use-cases-boundaries" title="What ProofOrigin is not">
          <ul className="use-cases-boundaries__list">
            {BOUNDARIES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </GlassPanel>
      </section>

      <section className="use-cases-cta" aria-label="Get started">
        <header className="home-section__header">
          <h2 className="home-section__title">Start with the trust layer</h2>
        </header>
        <div className="protocol-actions use-cases-cta__actions">
          <a href="/identity-card" className="primary">
            Create Trust Pass
          </a>
          <a href="/vault" className="secondary">
            Open Private Vault
          </a>
          <a href="/labs" className="secondary">
            Explore Labs
          </a>
        </div>
      </section>
    </PageShell>
  );
}
