import type { Metadata } from "next";
import { connection } from "next/server";

import { ChatWorkspace } from "@/components/ChatWorkspace";

export const metadata: Metadata = {
  title: "Merkliste | XPORTAL",
  description:
    "Ihre gespeicherten Freelancer-Profile für die spätere Auswahl.",
  // The page only ever shows one account's own saved profiles.
  robots: {
    index: false,
    follow: false,
  },
};

// Je Anfrage, damit die Nonce-CSP greift: siehe `NONCE_ROUTES` in
// lib/security/csp.ts.
export default async function MyTeamPage() {
  await connection();
  return <ChatWorkspace view="team" />;
}
