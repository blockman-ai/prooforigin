"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";

const LINKS = [
  { href: "/identity-card", label: "Trust Pass" },
  { href: "/vault", label: "Vault" },
  { href: "/use-cases", label: "Use Cases" },
  { href: "/voice-anchor", label: "Voice Anchor" },
  { href: "/labs", label: "Labs" },
  { href: "/dashboard", label: "Records" },
];

const MOBILE_LINKS = [
  { href: "/", label: "Home" },
  ...LINKS,
  { href: "/identity-card", label: "Create Trust Pass", cta: true },
];

export default function SiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((open) => !open);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen, closeMenu]);

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

        <Link href="/identity-card" className="site-nav__cta">
          Create Trust Pass
        </Link>

        <button
          type="button"
          className={`site-nav__menu-toggle${menuOpen ? " site-nav__menu-toggle--open" : ""}`}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={toggleMenu}
        >
          <span className="site-nav__menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            className="site-nav__backdrop"
            aria-label="Close navigation menu"
            onClick={closeMenu}
          />
          <div
            id={menuId}
            className="site-nav__mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
          >
            <ul className="site-nav__mobile-list">
              {MOBILE_LINKS.map((link) => (
                <li key={`${link.href}-${link.label}`}>
                  <Link
                    href={link.href}
                    className={`site-nav__mobile-link${
                      link.cta ? " site-nav__mobile-link--cta" : ""
                    }`.trim()}
                    onClick={closeMenu}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </nav>
  );
}
