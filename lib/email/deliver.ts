import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
// Ohne den ausdrücklichen Options-Typ wählt TypeScript die falsche Überladung
// von createTransport und kennt `host` nicht.
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import { IMPRINT_EMAIL } from "@/lib/legal/policy";
import { logEvent } from "@/lib/security/request";

import { normalizeEmail } from "./address";
import { checkEmailSuppression } from "./suppression";
import {
  unsubscribeConfigured,
  unsubscribeHeaders,
  unsubscribeUrl,
} from "./unsubscribe";

/**
 * Der Versandweg für jede E-Mail, die XPORTAL verschickt.
 *
 * Angebunden ist IONOS über SMTP. Der Anbieter sitzt in Deutschland
 * (1&1 IONOS SE, Montabaur) und verarbeitet innerhalb der EU — es entsteht
 * also keine Drittlandübermittlung, die gesondert abzusichern wäre. Der
 * Eintrag im Auftragsverarbeiter-Register hält das fest. SMTP statt HTTP-API,
 * weil IONOS keine Transaktions-API anbietet.
 *
 * Hier — und nur hier — wird die Sperrliste durchgesetzt. Das ist die engste
 * Stelle, durch die jeder Versand läuft: die Akquise, der Newsletter, jede
 * Bestätigung und jeder künftige Kanal. Eine Prüfung in der Leadgen-Route
 * hätte den nächsten Kanal wieder durchgelassen, und der Widerspruch nach
 * Art. 21 DSGVO gilt dem Verantwortlichen, nicht einer Tabelle.
 *
 * Die Unterscheidung, die dabei zählt, steht in `kind`:
 *
 *   * `cold_outreach` und `newsletter` sind Werbung. Wer widersprochen hat,
 *     bekommt sie nicht mehr — dauerhaft, unabhängig davon, aus welchem Teil
 *     der Anwendung sie kommt.
 *   * `transactional` ist alles, was zu einem Vorgang gehört, den die Person
 *     selbst ausgelöst hat: Anmeldebestätigung, Einladung, Buchung, Rechnung,
 *     Vertragsbestätigung in Textform. Diese Nachrichten gehen auch an eine
 *     gesperrte Adresse raus. Wer der Werbung widersprochen hat und sich
 *     später anmeldet, will die Bestätigung seiner Anmeldung sehen — sie ihm
 *     vorzuenthalten wäre keine Rücksicht, sondern ein Fehler.
 *
 * `kind` ist Pflicht und hat keinen Vorgabewert. Ein optionales Feld wäre die
 * Falle: der nächste Aufrufer vergisst es, der Vorgabewert entscheidet
 * stillschweigend, und niemand merkt etwas, weil die Mail ja rausgeht.
 */

/** Die Arten von Nachricht, die es gibt. */
export type EmailKind = "cold_outreach" | "newsletter" | "transactional";

/** Welche davon ein Widerspruch aufhält. */
const WERBLICH: ReadonlySet<EmailKind> = new Set<EmailKind>([
  "cold_outreach",
  "newsletter",
]);

export function isPromotional(kind: EmailKind): boolean {
  return WERBLICH.has(kind);
}

export type EmailMessage = {
  to: string;
  subject: string;
  /** Reiner Text. Für eine Bestätigungsmail braucht es kein HTML. */
  text: string;
  kind: EmailKind;
};

export type DeliveryFailure =
  | "provider_not_configured"
  | "unsubscribe_not_configured"
  | "invalid_recipient"
  /** Der Empfänger hat der Werbung widersprochen. */
  | "suppressed"
  /**
   * Die Sperrliste war nicht erreichbar. Es wird ebenfalls nicht versendet —
   * aber der Aufrufer darf das nicht als Widerspruch verbuchen und den
   * Vorgang deshalb dauerhaft verwerfen.
   */
  | "suppression_check_failed"
  | "send_failed";

export type DeliveryResult =
  | { delivered: true }
  | { delivered: false; reason: DeliveryFailure };

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

/**
 * Ohne vollständige Konfiguration wird nicht geraten. Ein halb gesetzter
 * Zugang, der beim ersten Versand scheitert, wäre schlechter als ein
 * abgeschalteter Versand, den die Oberfläche benennen kann.
 */
function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM?.trim() || user;
  const port = Number.parseInt(process.env.SMTP_PORT?.trim() || "587", 10);

  if (!host || !user || !password || !from) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;

  return { host, port, user, password, from };
}

export function emailDeliveryConfigured(): boolean {
  return smtpConfig() !== null;
}

/**
 * Ob werblich versendet werden darf.
 *
 * Strenger als `emailDeliveryConfigured()`, weil eine Werbenachricht ohne
 * funktionierenden Abmeldelink nicht rausgehen darf. Die Oberfläche fragt
 * das, bevor sie den Versandknopf freigibt — sonst erführe der Betreiber es
 * erst an einer Fehlermeldung mitten im Stapel.
 */
export function promotionalDeliveryConfigured(): boolean {
  return emailDeliveryConfigured() && unsubscribeConfigured();
}

/**
 * Die Adresse, unter der die Anwendung öffentlich erreichbar ist.
 *
 * Für einen Abmeldelink zählt nur die Produktionsadresse: die Nachricht wird
 * archiviert und Monate später geöffnet, und ein Link auf eine Vorschau-URL
 * wäre bis dahin längst tot.
 */
export function publicMailOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:") return url.origin;
    } catch {
      // Fällt auf die feste Adresse zurück.
    }
  }
  return "https://x-portal.eu";
}

let cachedTransport: Transporter | null = null;
let cachedFor = "";

function transportFor(config: SmtpConfig): Transporter {
  // Der Schlüssel enthält bewusst kein Passwort: Er soll nur erkennen, ob sich
  // die Konfiguration geändert hat.
  const key = `${config.host}:${config.port}:${config.user}`;
  if (cachedTransport && cachedFor === key) return cachedTransport;

  const options: SMTPTransport.Options = {
    host: config.host,
    port: config.port,
    // 465 spricht von Anfang an TLS, 587 handelt es über STARTTLS aus.
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.password },
    // Kein Verbindungspool: Eine Funktionsinstanz lebt kurz, ein offen
    // gehaltener Pool brächte nichts und hielte sie nur am Leben. Das ist
    // ohnehin die Voreinstellung, deshalb steht hier keine Option.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
  cachedTransport = nodemailer.createTransport(options);
  cachedFor = key;
  return cachedTransport;
}

export async function deliverEmail(
  message: EmailMessage,
): Promise<DeliveryResult> {
  const config = smtpConfig();
  if (!config) {
    // Kein Empfänger, kein Betreff, kein Text im Log — nur die Tatsache.
    logEvent("email_delivery_skipped", { reason: "provider_not_configured" });
    return { delivered: false, reason: "provider_not_configured" };
  }

  const recipient = normalizeEmail(message.to);
  if (!recipient) {
    logEvent("email_delivery_skipped", { reason: "invalid_recipient" });
    return { delivered: false, reason: "invalid_recipient" };
  }

  let headers: Record<string, string> | undefined;

  if (isPromotional(message.kind)) {
    // Der Abmeldelink entsteht hier, nicht im Aufrufer. Eine Werbenachricht
    // ohne funktionierenden Widerspruch darf es nicht geben, und die einzige
    // verlässliche Art, das sicherzustellen, ist, den Versand daran zu
    // hindern.
    const url = unsubscribeUrl(publicMailOrigin(), recipient);
    if (!url) {
      logEvent("email_delivery_skipped", {
        reason: "unsubscribe_not_configured",
        kind: message.kind,
      });
      return { delivered: false, reason: "unsubscribe_not_configured" };
    }

    const suppression = await checkEmailSuppression(recipient);
    if (suppression !== "clear") {
      // Der Widerspruch ist kein Fehler, sondern der Normalfall, für den die
      // Sperrliste gebaut wurde. Ein Ausfall der Prüfung ist einer.
      logEvent(
        suppression === "suppressed"
          ? "email_delivery_suppressed"
          : "email_delivery_skipped",
        { kind: message.kind, reason: suppression },
      );
      return {
        delivered: false,
        reason:
          suppression === "suppressed" ? "suppressed" : "suppression_check_failed",
      };
    }

    headers = unsubscribeHeaders({ url, mailto: IMPRINT_EMAIL });
  }

  try {
    await transportFor(config).sendMail({
      from: config.from,
      to: recipient,
      subject: message.subject,
      text: message.text,
      headers,
    });
    logEvent("email_delivered", { host: config.host, kind: message.kind });
    return { delivered: true };
  } catch (error) {
    // Die Fehlermeldung eines SMTP-Servers nennt regelmäßig die
    // Empfängeradresse. Ins Log geht deshalb nur die Art des Fehlers.
    const code = (error as { code?: unknown })?.code;
    logEvent("email_delivery_failed", {
      host: config.host,
      kind: message.kind,
      code: typeof code === "string" ? code.slice(0, 40) : "unknown",
    });
    return { delivered: false, reason: "send_failed" };
  }
}

export function resetEmailTransportForTests(): void {
  cachedTransport = null;
  cachedFor = "";
}
