import "./globals.css";

export const metadata = {
  title: "ProofOrigin",
  description:
    "Advanced authenticity verification for digital content in the age of AI.",

  openGraph: {
    title: "ProofOrigin",
    description:
      "Advanced authenticity verification for digital content in the age of AI.",
    url: "https://www.prooforigin.org",
    siteName: "ProofOrigin",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "ProofOrigin",
    description:
      "Advanced authenticity verification for digital content in the age of AI.",
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
