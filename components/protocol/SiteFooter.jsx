import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__notice">
          ProofOrigin is personal trust infrastructure — verify identity, protect documents,
          and stay in control with zero-knowledge design.
        </p>
        <div className="site-footer__links">
          <Link href="/identity-card">Trust Pass</Link>
          <Link href="/vault">Vault</Link>
          <Link href="/labs">Labs</Link>
          <Link href="/">Home</Link>
        </div>
      </div>
    </footer>
  );
}
