import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Expedition Apps",
  description: "Unified web platform for expedition marine processing tools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="site-header">
            <Link className="brand" href="/">
              Expedition Apps
            </Link>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
