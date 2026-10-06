import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BridgeTrace — CCTP USDC transfer diagnostics",
  description:
    "Trace your USDC burn, Circle attestation, and destination receipt between Ethereum and Base. Read-only CCTP V2 diagnostics with exportable evidence.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
