/**
 * Die Nachricht an eine recherchierte Person.
 *
 * Art. 14 DSGVO verpflichtet dazu, jemanden zu informieren, dessen Daten nicht
 * bei ihm selbst erhoben wurden — mit Zweck, Herkunft, Speicherdauer und
 * Widerspruchsrecht. Diese Pflicht ist der Grund, warum es dieses Modul gibt:
 * die Information darf nicht davon abhängen, ob jemand später daran denkt.
 *
 * Hier entsteht nur der Text. Verschickt wird er von `outreach-send.ts` über
 * denselben Weg wie jede andere Nachricht, mit der Sperrliste davor — oder,
 * wenn keine Adresse bekannt ist, von Hand über ein Netzwerk oder das
 * Kontaktformular der Person.
 *
 * Der Text sagt ausdrücklich, dass XPORTAL ein Portal ist und keine Person,
 * die Profile von Hand heraussucht. Auf der Auftraggeberseite hat dieser Satz
 * gefehlt, und ein Empfänger hat daraufhin den Suchassistenten im Chat mit dem
 * Namen des Betreibers angesprochen. Hier wäre dieselbe Verwechslung
 * schlimmer: Wer glaubt, ihm schreibe ein einzelner Vermittler, versteht
 * nicht, wofür er sich einträgt.
 */

export type OutreachChannel = "email" | "linkedin" | "website" | "other";

export type OutreachCandidate = {
  fullName: string;
  roleTitle: string;
  /** Woher die Angaben stammen. Ohne Quelle keine Ansprache. */
  sourceUrls: readonly string[];
};

export type OutreachDraft = {
  channel: OutreachChannel;
  /** Nur bei E-Mail belegt. */
  subject: string | null;
  body: string;
  characters: number;
  /** Falsch, wenn der Kanal die Länge nicht trägt — dann kürzen. */
  withinChannelLimit: boolean;
  /** Fertiger mailto:-Link, sofern eine Adresse bekannt ist. */
  mailtoUrl: string | null;
};

/**
 * LinkedIn schneidet lange Nachrichten ab. Der Wert liegt bewusst unter dem
 * InMail-Maximum, damit die Nachricht auch als normale Direktnachricht trägt.
 */
export const LINKEDIN_CHARACTER_LIMIT = 1_400;
export const EMAIL_CHARACTER_LIMIT = 5_000;
export const DEFAULT_RETENTION_DAYS = 30;

function limitForChannel(channel: OutreachChannel): number {
  return channel === "linkedin" ? LINKEDIN_CHARACTER_LIMIT : EMAIL_CHARACTER_LIMIT;
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  const [first] = trimmed.split(/\s+/u);
  // "A. Schmidt" mit "Hallo A.," anzureden wirkt wie ein kaputter Serienbrief.
  // Nur ein echter Vorname wird verkürzt, sonst bleibt der volle Name stehen.
  return first && /^\p{L}{2,}$/u.test(first) ? first : trimmed;
}

function hostList(urls: readonly string[]): string {
  const hosts: string[] = [];
  for (const url of urls) {
    try {
      const host = new URL(url).hostname.replace(/^www\./u, "");
      if (!hosts.includes(host)) hosts.push(host);
    } catch {
      // Eine unlesbare Quelle wird weggelassen, nicht geraten.
    }
  }
  return hosts.join(", ");
}

function requirementLine(projectHint: string | null): string {
  const hint = projectHint?.trim();
  if (!hint) {
    return "Ein Unternehmen sucht gerade Unterstützung in Ihrem Fachgebiet.";
  }
  return `Ein Unternehmen sucht gerade Unterstützung für: ${hint}.`;
}

/**
 * Die Kurzfassung für LinkedIn. Enthält dieselben Pflichtangaben, nur dichter —
 * die ausführliche Fassung steht hinter dem Link.
 */
function linkedinBody(input: {
  candidate: OutreachCandidate;
  projectHint: string | null;
  inviteUrl: string;
  retentionDays: number;
  senderName: string;
}): string {
  const sources = hostList(input.candidate.sourceUrls);
  return [
    `Hallo ${firstName(input.candidate.fullName)},`,
    "",
    `${requirementLine(input.projectHint)} Über XPORTAL vermitteln wir Freelancer an Auftraggeber, und Ihr öffentliches Profil passt zu dieser Anfrage.`,
    "",
    `Damit Sie wissen, woher ich komme: Ich habe Ihren Namen, Ihre Rolle und Ihre öffentlichen Links${sources ? ` (${sources})` : ""} notiert. Diese Notiz lösche ich nach ${input.retentionDays} Tagen automatisch, wenn Sie nicht antworten. Sie können jederzeit widersprechen — eine kurze Nachricht genügt, dann ist der Eintrag sofort weg.`,
    "",
    `Wenn Sie Interesse haben: Hier können Sie Ihre Angaben prüfen und Ihren Lebenslauf hinterlegen — ${input.inviteUrl}`,
    "",
    `Viele Grüße`,
    input.senderName,
  ].join("\n");
}

function emailBody(input: {
  candidate: OutreachCandidate;
  projectHint: string | null;
  inviteUrl: string;
  retentionDays: number;
  senderName: string;
  senderEmail: string;
  unsubscribeUrl: string | null;
}): string {
  const sources = hostList(input.candidate.sourceUrls);
  return [
    `Hallo ${firstName(input.candidate.fullName)},`,
    "",
    requirementLine(input.projectHint),
    "",
    `XPORTAL ist ein Suchportal für Freelancer: Auftraggeber beschreiben dort ihren Bedarf und bekommen passende Profile vorgeschlagen — mit Stundensatz, Verfügbarkeit und Terminlink zum direkten Buchen. Bei der Recherche zu dieser Anfrage ist Ihr öffentliches Profil aufgetaucht.`,
    "",
    `Wenn Sie sich eintragen, werden Sie bei dieser und bei künftigen Anfragen gefunden. Sie hinterlegen dabei Ihre Angaben und Ihren Lebenslauf; ohne Ihre ausdrückliche Zustimmung bekommt kein Auftraggeber etwas davon zu sehen.`,
    "",
    input.inviteUrl,
    "",
    `Weil ich Ihre Daten nicht bei Ihnen selbst erhoben habe, bin ich verpflichtet, Sie darüber zu informieren:`,
    "",
    `• Gespeichert habe ich: Ihren Namen, Ihre Rolle "${input.candidate.roleTitle}" und öffentlich zugängliche Links zu Ihnen.`,
    `• Herkunft der Angaben: öffentlich zugängliche Quellen${sources ? ` (${sources})` : ""}.`,
    `• Zweck: die Prüfung, ob Sie zu einer konkreten Projektanfrage passen.`,
    `• Speicherdauer: ${input.retentionDays} Tage ab der Recherche. Danach wird der Eintrag automatisch und vollständig gelöscht, wenn Sie bis dahin nicht zustimmen.`,
    `• Ihre Rechte: Auskunft, Berichtigung, Löschung und Widerspruch. Eine formlose Antwort auf diese E-Mail genügt, und ich lösche den Eintrag sofort.`,
    "",
    `Wenn Sie nichts tun, erledigt sich die Sache von selbst — der Eintrag verfällt.`,
    // Der Abmeldelink steht zusätzlich zum Widerspruch per Antwort, nicht
    // statt seiner: Er wirkt sofort und ohne dass jemand eine Mail lesen muss.
    ...(input.unsubscribeUrl
      ? ["", `Keine weitere Post von XPORTAL? Ein Klick: ${input.unsubscribeUrl}`]
      : []),
    "",
    `Viele Grüße`,
    `${input.senderName} — XPORTAL`,
    input.senderEmail,
  ].join("\n");
}

export function buildOutreachDraft(input: {
  channel: OutreachChannel;
  candidate: OutreachCandidate;
  inviteUrl: string;
  senderName: string;
  senderEmail: string;
  contactEmail?: string | null;
  projectHint?: string | null;
  retentionDays?: number;
  /**
   * Der Abmeldelink. Optional, damit die Textbausteine für sich prüfbar
   * bleiben; im Versand fehlt er nie, weil `deliverEmail()` eine werbliche
   * Nachricht ohne funktionierenden Abmeldeweg gar nicht erst durchlässt.
   */
  unsubscribeUrl?: string | null;
}): OutreachDraft {
  const retentionDays = input.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const projectHint = input.projectHint?.trim() ? input.projectHint.trim() : null;

  const body =
    input.channel === "linkedin"
      ? linkedinBody({
          candidate: input.candidate,
          projectHint,
          inviteUrl: input.inviteUrl,
          retentionDays,
          senderName: input.senderName,
        })
      : emailBody({
          candidate: input.candidate,
          projectHint,
          inviteUrl: input.inviteUrl,
          retentionDays,
          senderName: input.senderName,
          senderEmail: input.senderEmail,
          unsubscribeUrl: input.unsubscribeUrl ?? null,
        });

  const subject =
    input.channel === "email"
      ? `Projektanfrage über XPORTAL – und wie ich an Ihre Daten komme`
      : null;

  return {
    channel: input.channel,
    subject,
    body,
    characters: body.length,
    withinChannelLimit: body.length <= limitForChannel(input.channel),
    mailtoUrl:
      input.channel === "email" && input.contactEmail?.trim()
        ? `mailto:${encodeURIComponent(input.contactEmail.trim())}` +
          `?subject=${encodeURIComponent(subject ?? "")}` +
          `&body=${encodeURIComponent(body)}`
        : null,
  };
}
