import "./globals.css";
import GuideAppShell from "../components/guide/GuideAppShell.jsx";

const SITE_DESCRIPTION =
  "Personal trust infrastructure for identity, custody, and recovery. Trust Pass, Private Vault, and zero-knowledge design.";

export const metadata = {
  title: "ProofOrigin | Personal Trust Infrastructure",
  description: SITE_DESCRIPTION,

  openGraph: {
    title: "ProofOrigin | Personal Trust Infrastructure",
    description: SITE_DESCRIPTION,
    url: "https://www.prooforigin.org",
    siteName: "ProofOrigin",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "ProofOrigin | Personal Trust Infrastructure",
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <GuideAppShell>{children}</GuideAppShell>
      </body>
    </html>
  );
}
