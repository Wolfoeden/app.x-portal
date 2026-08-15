import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { CookieConsent } from "@/components/CookieConsent";
import "./globals.css";

// The stylesheet asked for Inter but nothing ever loaded it, so every visitor
// fell back to a system face. That mattered because the design leans on
// intermediate weights (560, 590, 650, 680, 750); static fallbacks round those
// to 400/700 and collapse the type hierarchy. next/font self-hosts the files,
// which also keeps them inside the `font-src 'self'` CSP in next.config.ts.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://x-portal.eu"),
  title: {
    default: "XPORTAL",
    template: "%s",
  },
  description:
    "One intelligent conversational interface connecting insights and specialized digital spaces.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de" className={inter.variable}>
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
