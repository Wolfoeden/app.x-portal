import type { Metadata } from "next";
import { connection } from "next/server";

import { ChatWorkspace } from "@/components/ChatWorkspace";

export const metadata: Metadata = {
  title: "Gespräche | XPORTAL",
  description: "Der Stand Ihrer Anfragen: angefragt, vorgestellt, beauftragt.",
  // Nur die eigenen Anfragen; über einen Link aus der Mail auch ohne Anmeldung.
  robots: {
    index: false,
    follow: false,
  },
};

// Je Anfrage, damit die Nonce-CSP greift: siehe `NONCE_ROUTES` in
// lib/security/csp.ts.
export default async function ConversationsRoute() {
  await connection();
  return <ChatWorkspace view="conversations" />;
}
