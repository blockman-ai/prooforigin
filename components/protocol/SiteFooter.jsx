import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__notice">
          ProofOrigin records protocol-scoped evaluation metadata. It does not
          verify absolute truth.
        </p>
        <div className="site-footer__links">
          <Link href="/upload">Upload</Link>
          <Link href="/detect">Detect</Link>
          <Link href="/">Home</Link>
        </div>
      </div>
    </footer>
  );
}
