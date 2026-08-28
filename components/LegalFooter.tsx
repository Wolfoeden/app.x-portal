import Link from "next/link";

import { CookieSettingsButton } from "./CookieConsent";

/**
 * Die Pflichtlinks an einer Stelle.
 *
 * Impressum und Datenschutz müssen von jeder Seite aus leicht erkennbar,
 * unmittelbar erreichbar und ständig verfügbar sein. Das galt bisher für die
 * Chat-Ansicht, nicht aber für die Merkliste und das Agentenverzeichnis: Beide
 * rendern denselben Rahmen, aber nicht die Zeile über dem Eingabefeld, an der
 * die Links hingen.
 *
 * Als eigene Komponente statt als kopierte Zeile, damit die nächste Ansicht
 * die Links nicht wieder vergisst.
 */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`legal-footer ${className}`.trim()}>
      <nav aria-label="Rechtliches">
        <Link href="/imprint">Impressum</Link>
        <span aria-hidden="true">·</span>
        <Link href="/privacy">Datenschutz</Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms">AGB</Link>
        <span aria-hidden="true">·</span>
        <Link href="/contact">Kontakt</Link>
      </nav>
      <CookieSettingsButton className="legal-footer-button" />
    </footer>
  );
}
