import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * Der Meldeweg für Schwachstellen nach RFC 9116.
 *
 * Ohne ihn hat jemand, der etwas findet, nur die allgemeine Info-Adresse —
 * der übliche Grund, warum Funde entweder gar nicht oder gleich öffentlich
 * gemeldet werden.
 *
 * Als Route statt als statische Datei, weil `Expires` ein Datum in der Zukunft
 * tragen muss und ein abgelaufenes `security.txt` schlechter ist als keines.
 * Hier wandert das Datum von selbst mit.
 */
const EXPIRY_DAYS = 365;

export function GET() {
  const expires = new Date(Date.now() + EXPIRY_DAYS * 86_400_000);
  // Auf den Monatsanfang gerundet, damit nicht jeder Abruf einen anderen Wert
  // liefert und Caches sich widersprechen.
  expires.setUTCDate(1);
  expires.setUTCHours(0, 0, 0, 0);

  const body = [
    "Contact: mailto:info@x-portal.eu",
    `Contact: ${SITE_URL}/contact`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: de, en",
    `Canonical: ${SITE_URL}/.well-known/security.txt`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
