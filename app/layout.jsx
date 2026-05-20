import "./globals.css";

export const metadata = {
  title: "ProofOrigin",
  description: "Prove what's real. Bitcoin-backed proof of authenticity for digital content in the age of AI.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
