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
      <body>{children}</body>
    </html>
  );
}
