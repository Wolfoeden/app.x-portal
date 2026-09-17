import Link from "next/link";

import { CookieSettingsButton } from "./CookieConsent";

/**
 * Die Pflichtlinks an einer Stelle.
 *
 * Impressum und Datenschutz müssen von jeder Seite aus leicht erkennbar,
 * unmittelbar erreichbar und ständig verfügbar sein. Das galt bisher für die
 * Chat-Ansicht, nicht aber für die Merkliste: Sie rendert denselben Rahmen,
 * aber nicht die Zeile über dem Eingabefeld, an der die Links hingen.
 *
 * Als eigene Komponente statt als kopierte Zeile, damit die nächste Ansicht
 * die Links nicht wieder vergisst. Die Gruppe ist bewusst kein eigener
 * `<footer>`: Sie wird sowohl in App-Flächen als auch innerhalb des globalen
 * Seitenfußes verwendet und darf dort kein zweites Landmark verschachteln.
 */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <div className={`legal-footer ${className}`.trim()}>
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
    </div>
  );
}
