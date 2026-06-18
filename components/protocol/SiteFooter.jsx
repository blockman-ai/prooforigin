import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__notice">
          ProofOrigin verifies provenance, custody, and ownership history for digital and physical assets.
        </p>
        <div className="site-footer__links">
          <Link href="/assets">Collection</Link>
          <Link href="/assets/register">Register</Link>
          <Link href="/assets/transfers">Transfers</Link>
          <Link href="/vault">Account</Link>
          <Link href="/verify/receipt">Check Proof</Link>
          <Link href="/identity-card">Trust Pass</Link>
          <Link href="/labs">Labs</Link>
        </div>
      </div>
    </footer>
  );
}
