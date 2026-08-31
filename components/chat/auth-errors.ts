/**
 * Die Fehlermeldung beim Anmelden und beim Anlegen eines Kontos.
 *
 * Der Anlass: Als der Mailversand von Supabase Auth die SMTP-Zugangsdaten nicht
 * mehr annahm, antwortete `/signup` mit 500 — und die Oberflaeche sagte "Prüfen
 * Sie E-Mail und Passwort". Beides war korrekt. Wer das liest, sucht den Fehler
 * bei sich, aendert das Passwort, versucht eine andere Adresse und kommt nie an,
 * weil an der Eingabe nichts falsch war.
 *
 * Eine Meldung darf deshalb nur dann auf die Eingabe zeigen, wenn der Server
 * die Eingabe auch tatsaechlich beanstandet hat.
 */
export type AuthAttemptMode = "login" | "register" | "recover" | "set-password";

/** Was Supabase an einem Fehler mitliefert, soweit wir es auswerten. */
type MaybeAuthError = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
};

function readStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as MaybeAuthError).status;
  return typeof status === "number" ? status : null;
}

function readCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const code = (error as MaybeAuthError).code;
  return typeof code === "string" ? code.toLowerCase() : "";
}

function readMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : "";
}

/**
 * Liegt der Fehler beim Dienst und nicht bei der Eingabe?
 *
 * 5xx heisst das immer. `unexpected_failure` meldet Supabase auch dann, wenn
 * das Konto selbst angelegt werden koennte, der Versand der Bestaetigungsmail
 * aber scheitert — genau der Fall, der diese Datei ausgeloest hat.
 */
export function isServiceSideAuthFailure(error: unknown): boolean {
  const status = readStatus(error);
  if (status !== null && status >= 500) return true;

  const code = readCode(error);
  if (code === "unexpected_failure" || code === "over_email_send_rate_limit") return true;

  const message = readMessage(error);
  return (
    message.includes("error sending confirmation") ||
    message.includes("error sending recovery") ||
    message.includes("smtp")
  );
}

const SERVICE_SIDE_MESSAGE =
  "Das liegt gerade nicht an Ihren Angaben, sondern an unserem Dienst — der Bestätigungsversand ist vorübergehend gestört. Bitte versuchen Sie es später erneut oder wenden Sie sich an Roman Dering.";

export function authErrorMessage(error: unknown, mode: AuthAttemptMode): string {
  if (isServiceSideAuthFailure(error)) return SERVICE_SIDE_MESSAGE;

  const message = readMessage(error);
  const code = readCode(error);

  if (
    mode === "login" &&
    (code === "invalid_credentials" ||
      message.includes("invalid login") ||
      message.includes("invalid credentials"))
  ) {
    return "E-Mail oder Passwort ist nicht korrekt. Nutzen Sie bei Bedarf ‚Passwort vergessen?‘.";
  }

  if (mode === "register" && (code === "user_already_exists" || message.includes("already registered"))) {
    return "Zu dieser Adresse gibt es bereits ein Konto. Melden Sie sich unter ‚Bestehendes Konto‘ an.";
  }

  if (code === "weak_password" || message.includes("password should be")) {
    return "Das Passwort ist zu kurz oder zu einfach. Bitte wählen Sie ein längeres.";
  }

  if (mode === "login") {
    return "E-Mail oder Passwort ist nicht korrekt. Nutzen Sie bei Bedarf ‚Passwort vergessen?‘.";
  }
  if (mode === "recover") {
    return "Der Wiederherstellungslink konnte gerade nicht versendet werden.";
  }
  if (mode === "register") {
    return "Das Konto konnte gerade nicht erstellt werden. Prüfen Sie E-Mail und Passwort.";
  }
  return "Das neue Passwort konnte gerade nicht gespeichert werden.";
}
