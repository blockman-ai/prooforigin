import "./globals.css";

export const metadata = {
  title: "ProofOrigin",
  description:
    "Protocol-scoped evaluation records for digital media—not absolute truth verification.",

  openGraph: {
    title: "ProofOrigin",
    description:
      "Protocol-scoped evaluation records for digital media—not absolute truth verification.",
    url: "https://www.prooforigin.org",
    siteName: "ProofOrigin",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "ProofOrigin",
    description:
      "Protocol-scoped evaluation records for digital media—not absolute truth verification.",
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
