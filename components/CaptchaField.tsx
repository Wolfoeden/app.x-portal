import Script from "next/script";

import { captchaSiteKey } from "@/lib/security/captcha";

/**
 * Das hCaptcha-Kaestchen fuer die oeffentlichen Formulare.
 *
 * Bewusst die sichtbare Checkbox und keine der unsichtbaren Varianten: hier
 * wird ein Dienst in den USA eingebunden, und wer ein Formular abschickt, soll
 * das sehen koennen. Der Hinweis darunter benennt den Anbieter, statt ihn hinter
 * einem Logo zu lassen.
 *
 * Das Widget schreibt seine Antwort selbst als verstecktes Feld
 * `h-captcha-response` in das umgebende Formular. Fuer die beiden reinen
 * HTML-Formulare braucht es deshalb keinerlei JavaScript von uns; das Feld
 * kommt mit dem normalen Absenden mit.
 *
 * Ohne gesetzten Sitekey rendert die Komponente nichts. Damit bleibt die
 * lokale Entwicklung ohne Schluessel benutzbar — die Serverseite laesst in der
 * Entwicklung entsprechend durch und blockt in Produktion.
 */
export function CaptchaField({ className = "" }: { className?: string }) {
  const sitekey = captchaSiteKey();
  if (!sitekey) return null;

  return (
    <div className={`captcha-field ${className}`.trim()}>
      <div className="h-captcha" data-sitekey={sitekey} data-theme="light" />
      <p className="captcha-note">
        Geschützt durch hCaptcha (Intuition Machines, Inc., USA).{" "}
        <a href="/privacy">Was dabei übertragen wird</a>
      </p>
      <Script src="https://js.hcaptcha.com/1/api.js" strategy="afterInteractive" async defer />
    </div>
  );
}
