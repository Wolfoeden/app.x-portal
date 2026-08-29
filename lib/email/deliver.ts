import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
// Ohne den ausdrücklichen Options-Typ wählt TypeScript die falsche Überladung
// von createTransport und kennt `host` nicht.
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import { logEvent } from "@/lib/security/request";

/**
 * Der Versandweg für Transaktionsmails.
 *
 * XPORTAL verschickt keine Werbung, sondern genau zwei Arten von Nachrichten:
 * die Bestätigung einer Whitelist-Anmeldung und — sobald es Zahlungen gibt —
 * die Vertragsbestätigung in Textform. Beides sind Nachrichten, die ankommen
 * müssen; deshalb wertet der Aufrufer das Ergebnis aus, statt anzunehmen, die
 * Mail sei unterwegs.
 *
 * Angebunden ist IONOS über SMTP. Der Anbieter sitzt in Deutschland
 * (1&1 IONOS SE, Montabaur) und verarbeitet innerhalb der EU — es entsteht
 * also keine Drittlandübermittlung, die gesondert abzusichern wäre. Der
 * Eintrag im Auftragsverarbeiter-Register hält das fest.
 *
 * SMTP statt HTTP-API, weil IONOS keine Transaktions-API anbietet. Das kostet
 * pro Nachricht einen Verbindungsaufbau; für die Menge, um die es hier geht,
 * ist das unerheblich.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Reiner Text. Für eine Bestätigungsmail braucht es kein HTML. */
  text: string;
};

export type DeliveryResult =
  | { delivered: true }
  | { delivered: false; reason: "provider_not_configured" | "send_failed" };

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

  try {
    await transportFor(config).sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    logEvent("email_delivered", { host: config.host });
    return { delivered: true };
  } catch (error) {
    // Die Fehlermeldung eines SMTP-Servers nennt regelmäßig die
    // Empfängeradresse. Ins Log geht deshalb nur die Art des Fehlers.
    const code = (error as { code?: unknown })?.code;
    logEvent("email_delivery_failed", {
      host: config.host,
      code: typeof code === "string" ? code.slice(0, 40) : "unknown",
    });
    return { delivered: false, reason: "send_failed" };
  }
}

export function resetEmailTransportForTests(): void {
  cachedTransport = null;
  cachedFor = "";
}
