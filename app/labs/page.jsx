import GlassPanel from "../../components/protocol/GlassPanel";
import PageShell from "../../components/protocol/PageShell";

const PROVENANCE_LINKS = [
  {
    href: "/upload",
    title: "Create Proof Record",
    description: "Upload media for protocol-scoped evaluation and durable record creation.",
  },
  {
    href: "/detect",
    title: "Live Detector",
    description: "Run the evaluation engine on an image. Not absolute truth.",
  },
  {
    href: "/dashboard",
    title: "Protocol Records",
    description: "Browse saved evaluation records from earlier uploads.",
  },
];

const ARCADE_LINKS = [
  { href: "/dog-game", title: "DOG BOOST Flight" },
  { href: "/snake-boost", title: "Snake BOOST" },
  { href: "/dog-hunt", title: "DOG HUNT" },
  { href: "/dog-swipe", title: "DOG Swipe" },
  { href: "/dog-stack", title: "DOG Stack" },
  { href: "/boost-runner", title: "Boost Runner" },
];

export default function LabsPage() {
  return (
    <PageShell
      badge="Labs • Experimental"
      title="Research and experiments"
      subtitle="Provenance tools and protocol arcade, separate from the core trust stack."
    >
      <section className="labs-section" aria-label="Media provenance">
        <GlassPanel title="Media provenance">
          <p className="labs-section__lead">
            Protocol-scoped evaluation for digital media. Structural evidence and engine
            diagnostics. Not a definitive truth verdict.
          </p>
          <ul className="labs-link-list">
            {PROVENANCE_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="labs-link-list__item">
                  <strong>{link.title}</strong>
                  <span>{link.description}</span>
                </a>
              </li>
            ))}
          </ul>
        </GlassPanel>
      </section>

      <section className="labs-section" aria-label="Protocol arcade">
        <GlassPanel title="Protocol arcade">
          <p className="labs-section__lead">
            Experimental drills. Not part of ProofOrigin trust infrastructure.
          </p>
          <div className="protocol-actions labs-arcade__actions">
            {ARCADE_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="game-button">
                {link.title}
              </a>
            ))}
          </div>
        </GlassPanel>
      </section>

      <p className="labs-back-link">
        <a href="/" className="secondary">
          Back to trust infrastructure
        </a>
      </p>
    </PageShell>
  );
}
