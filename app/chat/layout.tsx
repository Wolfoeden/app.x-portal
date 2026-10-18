import { connection } from "next/server";
import type { ReactNode } from "react";

/**
 * Der Talent Index und alles darunter entstehen je Anfrage.
 *
 * Bis 18.10.2026 war /chat beim Build vorgerendert. Dann steht keine Nonce im
 * HTML, und die Nonce-CSP aus `proxy.ts` hätte jeden Chunk blockiert — auf
 * der Seite, auf der Modellantworten und Profiltexte stehen. Ein CDN-Treffer
 * geht nicht verloren: /chat ist ohnehin `private, no-store`. Siehe
 * `NONCE_ROUTES` in lib/security/csp.ts.
 */
export default async function ChatLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();
  return children;
}
