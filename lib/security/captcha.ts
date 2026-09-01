/**
 * Die hCaptcha-Pruefung fuer die oeffentlichen Formulare.
 *
 * Whitelist-Anmeldung, Kontaktformular und Freelancer-Bewerbung standen bisher
 * nur hinter einem Honeypot und einem Rate-Limit. Beides haelt Gelegenheitsbots
 * ab, aber nichts, was ein Formular gezielt bedient.
 *
 * Die Pruefung liegt hier und nicht in den Routen, damit alle drei dieselbe
 * Antwort auf denselben Fehler geben — und damit sie ohne Netz und ohne
 * Next.js pruefbar ist.
 */

/** Der Feldname, den das hCaptcha-Widget selbst in das Formular schreibt. */
export const CAPTCHA_FIELD = "h-captcha-response";

const VERIFY_ENDPOINT = "https://api.hcaptcha.com/siteverify";

export type CaptchaResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "rejected" | "unreachable" | "not_configured" };

type SiteverifyResponse = {
  success?: unknown;
  "error-codes"?: unknown;
};

/** Der Sitekey ist oeffentlich und darf im Browser stehen. */
export function captchaSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY?.trim() || null;
}

/**
 * Ist der Captcha eingerichtet?
 *
 * Ohne beide Schluessel kann nicht geprueft werden. Was dann passiert,
 * entscheidet bewusst nicht diese Funktion, sondern `verifyCaptcha` — und zwar
 * unterschiedlich je nach Umgebung.
 */
export function captchaConfigured(): boolean {
  return Boolean(captchaSiteKey() && process.env.HCAPTCHA_SECRET?.trim());
}

/**
 * Prueft das Token gegen hCaptcha.
 *
 * **Fehlende Einrichtung faellt in Produktion zu, in der Entwicklung auf.**
 * Faellt sie ueberall auf, schuetzt ein vergessener Schluessel in Produktion
 * gar nichts und niemand merkt es; faellt sie ueberall zu, kann lokal niemand
 * mehr ein Formular abschicken, ohne sich Schluessel zu besorgen. Der
 * Unterschied ist keine Bequemlichkeit, sondern die Entscheidung, welchen
 * Fehler man lieber macht.
 *
 * Ein Netzfehler faellt immer zu: dass hCaptcha gerade nicht erreichbar ist,
 * sagt nichts darueber aus, ob am anderen Ende ein Mensch sitzt.
 */
export async function verifyCaptcha(
  token: string | null | undefined,
  remoteIp?: string | null,
  fetcher: typeof fetch = fetch,
): Promise<CaptchaResult> {
  const secret = process.env.HCAPTCHA_SECRET?.trim();
  const sitekey = captchaSiteKey();

  if (!secret || !sitekey) {
    return process.env.NODE_ENV === "production"
      ? { ok: false, reason: "not_configured" }
      : { ok: true };
  }

  const value = token?.trim();
  if (!value) return { ok: false, reason: "missing" };

  const body = new URLSearchParams({ secret, response: value, sitekey });
  // Die IP ist optional. hCaptcha nutzt sie zur Bewertung, und ohne sie
  // funktioniert die Pruefung ebenso — ein fehlender Wert darf sie also nicht
  // als leeres Feld verfaelschen.
  if (remoteIp) body.set("remoteip", remoteIp);

  let payload: SiteverifyResponse;
  try {
    const response = await fetcher(VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) return { ok: false, reason: "unreachable" };
    payload = (await response.json()) as SiteverifyResponse;
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  return payload.success === true ? { ok: true } : { ok: false, reason: "rejected" };
}

/**
 * Was der Nutzer liest.
 *
 * Ein fehlender Haken ist sein Fehler und wird benannt; alles andere ist
 * unserer und wird auch so gesagt. Die frueheren Sammelmeldungen liessen
 * jemanden nach einem Fehler suchen, den er nicht gemacht hat.
 */
export function captchaErrorMessage(reason: Exclude<CaptchaResult, { ok: true }>["reason"]): string {
  if (reason === "missing") {
    return "Bitte bestätigen Sie zuerst das Kästchen „Ich bin ein Mensch“.";
  }
  if (reason === "rejected") {
    return "Die Prüfung ist abgelaufen oder wurde nicht bestanden. Bitte setzen Sie den Haken erneut.";
  }
  return "Die Sicherheitsprüfung ist gerade nicht erreichbar. Bitte versuchen Sie es in einigen Minuten erneut.";
}
