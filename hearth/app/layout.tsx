import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Outfit } from "next/font/google";
import { Mark } from "@/components/Mark";
import { SideNav } from "@/components/SideNav";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const sans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Hearth",
    template: "%s · Hearth",
  },
  description: "A private ledger for shared expenses and the fewest payments that settle them.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable}`}>
        <a className="skip" href="#content">
          Skip to content
        </a>
        <div className="app">
          <aside className="sidebar">
            <a className="brand" href="/">
              <Mark />
              <span className="brand-copy">
                <span className="brand-name">Hearth</span>
                <span className="brand-tag">Shared costs</span>
              </span>
            </a>
            <SideNav />
            <p className="side-note">Balances stay on this computer.</p>
          </aside>
          <main id="content" className="main">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
