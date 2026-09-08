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

/**
 * Was gesucht wird, so konkret wie es belegt ist.
 *
 * Ein Satz wie „Ein Unternehmen sucht Unterstützung für: React + TypeScript"
 * sagt einem Freelancer zu wenig, um zu antworten. Er will wissen, worum es
 * geht, ob er hinfahren muss und was von seinen Fähigkeiten gefragt ist. Alle
 * drei Angaben liegen im Nachfrageprofil vor — sie standen bisher nur nicht
 * in der Nachricht.
 */
export type DemandBrief = {
  /** Das Thema in wenigen Worten, etwa „Datenmigration nach PostgreSQL". */
  headline: string;
  workMode: "remote" | "on_site" | "hybrid" | "unknown";
  /** Ort, wenn er für die Arbeitsform eine Rolle spielt. */
  location?: string | null;
  /**
   * Gefragte Erfahrungen, die auch auf dem Profil der Person stehen. Nur
   * diese, denn nur sie belegen, warum gerade sie angeschrieben wird.
   */
  matchingSkills?: readonly string[];
  /** Weitere gefragte Erfahrungen, ohne Überschneidung. */
  otherSkills?: readonly string[];
};

function workModePhrase(demand: DemandBrief): string | null {
  const ort = demand.location?.trim();
  switch (demand.workMode) {
    case "remote":
      return "remote";
    case "on_site":
      return ort ? `vor Ort in ${ort}` : "vor Ort";
    case "hybrid":
      return ort ? `hybrid, teils vor Ort in ${ort}` : "hybrid";
    default:
      // Nicht geraten: „Arbeitsform offen" in einer Werbemail klingt nach
      // Textbaustein. Dann steht dort lieber nichts.
      return null;
  }
}

function skillList(values: readonly string[], max: number): string {
  const teile = values
    .map((wert) => wert.trim())
    .filter(Boolean)
    .slice(0, max);
  if (teile.length === 0) return "";
  if (teile.length === 1) return teile[0]!;
  return `${teile.slice(0, -1).join(", ")} und ${teile.at(-1)}`;
}

/** Die Sätze zum Bedarf. Leer, wo nichts belegt ist. */
function requirementLines(input: {
  projectHint: string | null;
  demand: DemandBrief | null;
}): string[] {
  const { demand } = input;
  if (!demand) {
    const hint = input.projectHint?.trim();
    return [
      hint
        ? `Ein Unternehmen sucht gerade Unterstützung für: ${hint}.`
        : "Ein Unternehmen sucht gerade Unterstützung in Ihrem Fachgebiet.",
    ];
  }

  const arbeitsform = workModePhrase(demand);
  const kopf = `Ein Unternehmen sucht gerade Unterstützung im Bereich ${demand.headline.trim()}${
    arbeitsform ? ` — ${arbeitsform}` : ""
  }.`;

  const zeilen = [kopf];

  const treffer = skillList(demand.matchingSkills ?? [], 5);
  if (treffer) {
    zeilen.push(
      `Gefragt ist unter anderem Erfahrung mit ${treffer} — das steht so auch auf Ihrem Profil.`,
    );
  }

  const weitere = skillList(demand.otherSkills ?? [], 4);
  if (weitere) {
    zeilen.push(`Daneben geht es um ${weitere}.`);
  }

  return zeilen;
}

/**
 * Die Kurzfassung für LinkedIn. Enthält dieselben Pflichtangaben, nur dichter —
 * die ausführliche Fassung steht hinter dem Link.
 */
function linkedinBody(input: {
  candidate: OutreachCandidate;
  projectHint: string | null;
  demand: DemandBrief | null;
  inviteUrl: string;
  retentionDays: number;
  senderName: string;
}): string {
  const sources = hostList(input.candidate.sourceUrls);
  // Auf LinkedIn zählt jedes Zeichen: Kopfzeile und Überschneidung, der Rest
  // steht in der ausführlichen Fassung hinter dem Link.
  const bedarf = requirementLines({
    projectHint: input.projectHint,
    demand: input.demand,
  })
    .slice(0, 2)
    .join(" ");
  return [
    `Hallo ${firstName(input.candidate.fullName)},`,
    "",
    `${bedarf} Über XPORTAL vermitteln wir Freelancer an Auftraggeber, und Ihr öffentliches Profil passt zu dieser Anfrage.`,
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
  demand: DemandBrief | null;
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
    ...requirementLines({ projectHint: input.projectHint, demand: input.demand }),
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
  /** Die einfache Fassung: ein Satz. Weicht `demand`, sobald das gesetzt ist. */
  projectHint?: string | null;
  /** Der Bedarf mit Thema, Arbeitsform und den überschneidenden Erfahrungen. */
  demand?: DemandBrief | null;
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
  // Ein Bedarf ohne Thema ist keiner — dann bleibt es beim einfachen Satz.
  const demand = input.demand?.headline.trim() ? input.demand : null;

  const body =
    input.channel === "linkedin"
      ? linkedinBody({
          candidate: input.candidate,
          projectHint,
          demand,
          inviteUrl: input.inviteUrl,
          retentionDays,
          senderName: input.senderName,
        })
      : emailBody({
          candidate: input.candidate,
          projectHint,
          demand,
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
