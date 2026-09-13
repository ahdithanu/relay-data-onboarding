import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay | Deployment Workbench",
  description: "Map customer data, resolve exceptions, and publish verified releases with a complete audit history.",
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
