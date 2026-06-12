import Link from "next/link";

const LINKS = [
  { href: "/upload", label: "Upload" },
  { href: "/detect", label: "Detect" },
  { href: "/voice-anchor", label: "Voice Anchor" },
  { href: "/identity-card", label: "Identity Card" },
  { href: "/vault", label: "Vault" },
  { href: "/dashboard", label: "Records" },
];

export default function SiteNav() {
  return (
    <nav className="site-nav" aria-label="Main navigation">
      <div className="site-nav__inner">
        <Link href="/" className="site-nav__brand">
          <span className="site-nav__mark" aria-hidden="true" />
          <span>ProofOrigin</span>
        </Link>

        <div className="site-nav__links">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="site-nav__link">
              {link.label}
            </Link>
          ))}
        </div>

        <Link href="/upload" className="site-nav__cta">
          New Record
        </Link>
      </div>
    </nav>
  );
}
