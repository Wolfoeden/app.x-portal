/**
 * Die Nachricht an eine recherchierte Person.
 *
 * Art. 14 DSGVO verpflichtet dazu, jemanden zu informieren, dessen Daten nicht
 * bei ihm selbst erhoben wurden — mit Zweck, Herkunft, Speicherdauer und
 * Widerspruchsrecht. Diese Pflicht ist der Grund, warum es dieses Modul gibt:
 * die Information darf nicht davon abhängen, ob jemand später daran denkt.
 *
 * Bewusst keine Versandfunktion. XPORTAL hat keinen E-Mail-Anbieter (siehe
 * docs/processor-register.md), deshalb entsteht hier nur der Text. Verschickt
 * wird er von einem Menschen, der ihn vorher gelesen hat — was bei einer
 * Erstansprache ohnehin die ehrlichere Variante ist.
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
}): string {
  const sources = hostList(input.candidate.sourceUrls);
  return [
    `Hallo ${firstName(input.candidate.fullName)},`,
    "",
    `${requirementLine(input.projectHint)} Ich betreibe XPORTAL, eine Vermittlung zwischen Auftraggebern und Freelancern. Bei der Recherche zu dieser Anfrage bin ich auf Ihr öffentliches Profil gestoßen.`,
    "",
    `Konkret möchte ich Sie fragen, ob Sie Ihren Lebenslauf hinterlegen möchten, damit ich Sie dem Auftraggeber vorschlagen kann. Ohne Ihre ausdrückliche Zustimmung geschieht das nicht.`,
    "",
    `Weil ich Ihre Daten nicht bei Ihnen selbst erhoben habe, bin ich verpflichtet, Sie darüber zu informieren:`,
    "",
    `• Gespeichert habe ich: Ihren Namen, Ihre Rolle "${input.candidate.roleTitle}" und öffentlich zugängliche Links zu Ihnen.`,
    `• Herkunft der Angaben: öffentlich zugängliche Quellen${sources ? ` (${sources})` : ""}.`,
    `• Zweck: die Prüfung, ob Sie zu einer konkreten Projektanfrage passen.`,
    `• Speicherdauer: ${input.retentionDays} Tage ab der Recherche. Danach wird der Eintrag automatisch und vollständig gelöscht, wenn Sie bis dahin nicht zustimmen.`,
    `• Ihre Rechte: Auskunft, Berichtigung, Löschung und Widerspruch. Eine formlose Antwort auf diese E-Mail genügt, und ich lösche den Eintrag sofort.`,
    "",
    `Falls Sie Interesse haben, können Sie hier Ihre Angaben prüfen, ergänzen und Ihren Lebenslauf hochladen:`,
    input.inviteUrl,
    "",
    `Wenn Sie nichts tun, erledigt sich die Sache von selbst — der Eintrag verfällt.`,
    "",
    `Viele Grüße`,
    input.senderName,
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
