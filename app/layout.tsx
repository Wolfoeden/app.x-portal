import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Freelancer finden",
  description:
    "Beschreiben Sie Ihr Projekt im Chat und erhalten Sie eine nachvollziehbare Auswahl passender Freelancer.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
