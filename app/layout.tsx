import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

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
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
