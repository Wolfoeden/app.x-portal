import {
  IMPRINT_EMAIL,
  PROVIDER_IMPRINT_LINES,
} from "@/lib/legal/policy";

/**
 * Der Rahmen der Akquise-Mail.
 *
 * Geteilt in zwei Hälften, und die Trennung ist der eigentliche Punkt: den
 * werbenden Teil schreibt ein Sprachmodell, den Fuß schreibt dieser Code. Was
 * in jeder Nachricht stehen muss — wer schreibt, unter welcher Anschrift,
 * woher die Adresse stammt, wie lange sie bleibt und wie man das abstellt —,
 * darf nicht davon abhängen, was ein Modell in diesem Durchlauf für passend
 * hält.
 *
 * Der Fuß erfüllt drei Pflichten auf einmal: die Anbieterkennzeichnung nach
 * § 5 DDG, die Erkennbarkeit des Absenders nach § 6 DDG und die Information
 * nach Art. 14 DSGVO, weil die Adresse aus einer öffentlichen Ausschreibung
 * stammt und nicht von der Person selbst. Die Frist ist dieselbe, die
 * `run_leadgen_cleanup()` in der Datenbank tatsächlich durchsetzt — eine
 * Zusage, die niemand einhält, wäre schlimmer als keine.
 */

/**
 * Wer unterschreibt. Die Anbieterkennzeichnung selbst steht in
 * `lib/legal/policy.ts`, damit sie nicht von der des Impressums abweicht.
 */
export const SENDER_PERSON = "Roman Dering";
export const IMPRINT_URL = "https://x-portal.eu/imprint";
export const PRIVACY_URL = "https://x-portal.eu/privacy";

/**
 * Deckungsgleich mit `retention_policies.leadgen_unhandled` in der Datenbank.
 *
 * Von 90 auf 30 gekuerzt: Eine vier Wochen alte Ausschreibung ist in dieser
 * Branche wertlos, und was wertlos ist, muss nicht gespeichert bleiben.
 */
export const LEAD_RETENTION_DAYS = 30;

export type LeadMessageInput = {
  /** Der werbende Teil, ohne Anrede und ohne Grußformel. */
  body: string;
  recipientName: string | null;
  company: string | null;
  /** Adresse, unter der die Antwort und ein Widerspruch ankommen. */
  senderEmail: string;
  /** Die Ausschreibung, auf die sich die Nachricht bezieht. */
  sourceUrl: string | null;
  /** Der Abmeldelink für diesen Empfänger. Siehe `legalFooter`. */
  unsubscribeUrl?: string | null;
  /**
   * Der Link ins Portal, mit der ausgeschriebenen Rolle vorausgefüllt.
   *
   * Er entsteht hier und nicht im Modell — aus demselben Grund wie der Fuß:
   * Der Ausschreibungstext ist Fremdmaterial, und ein Modell, das daraus einen
   * Link übernimmt, setzt eine fremde Adresse in eine Nachricht, die unter
   * unserem Namen rausgeht. Die Modellanweisung verbietet Links deshalb
   * ausdrücklich; dieser eine wird angebaut.
   */
  ctaUrl?: string | null;
  /**
   * Ob Anrede und Grußformel aus dem Text entfernt werden sollen.
   *
   * Richtig für einen Modellentwurf, der beides trotz Anweisung mitliefert.
   * Falsch für einen Text, den der Betreiber selbst getippt hat: dort hätte
   * eine Wendung wie „beste Grüße nach München" mitten im Absatz alles
   * Nachfolgende stillschweigend abgeschnitten.
   */
  trimModelPhrases?: boolean;
};

/**
 * Ohne Namen keine erfundene Anrede.
 *
 * „Sehr geehrte Damen und Herren" ist bei einer Firmenadresse richtig; ein
 * geratener Nachname wäre peinlich und bei `info@`-Adressen fast immer falsch.
 */
export function salutation(
  recipientName: string | null,
  company: string | null,
): string {
  const name = recipientName?.trim();
  if (name && /^\p{L}[\p{L}\p{M}'-]+(\s+\p{L}[\p{L}\p{M}'-]+)+$/u.test(name)) {
    return `Guten Tag ${name},`;
  }
  const firma = company?.trim();
  if (firma) return `Guten Tag ${firmenname(firma)} Team,`;
  return "Sehr geehrte Damen und Herren,";
}

/**
 * Der Name, mit dem sich eine Firma ansprechen lässt.
 *
 * Zwei Dinge fallen weg. Der Klammerzusatz zuerst: Die Importquelle führt
 * Doppelnennungen wie „Thryve (Thryve Consulting GmbH)" oder „Randstad
 * Professional GmbH (vorm. GULP)", und daraus wurde eine Anrede, die den
 * Firmennamen zweimal enthielt. Danach die Rechtsform, weil aus
 * „Krongaard GmbH Team" ein „Krongaard Team" wird, das sich lesen lässt.
 *
 * Die Reihenfolge zählt: Bei „RED Commerce GmbH (RED Global)" steht die
 * Rechtsform vor der Klammer und wäre am Zeilenende nicht mehr zu fassen,
 * wenn die Klammer stehen bliebe.
 */
const KLAMMERZUSATZ = /\s*[(（][^)）]*[)）]\s*/gu;
const RECHTSFORM =
  /\s+(GmbH(\s*&\s*Co\.?\s*KG)?|AG|UG(\s*\(haftungsbeschränkt\))?|KG|OHG|e\.?K\.?|SE|mbH|Ltd\.?|Inc\.?|GbR)$/iu;

export function firmenname(company: string): string {
  const ohneKlammer = company
    .replace(KLAMMERZUSATZ, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const ohneRechtsform = ohneKlammer.replace(RECHTSFORM, "").trim();
  return ohneRechtsform || ohneKlammer || company.trim();
}

/**
 * Der feste Fuß. Er nennt die Quelle der Adresse konkret, weil eine pauschale
 * Angabe („aus öffentlich zugänglichen Quellen") die Auskunft nach Art. 14
 * gerade nicht erfüllt, und er nennt die Speicherdauer in Tagen statt in
 * „solange erforderlich".
 */
export function legalFooter(input: {
  senderEmail: string;
  sourceUrl: string | null;
  /**
   * Der Abmeldelink. Er steht am Ende und mit eigener Einleitung: Wer ihn
   * sucht, sucht ihn dort, und ein Halbsatz mit Fragezeichen las sich unter
   * einer Geschäftsmail wie ein Werbebanner.
   *
   * Optional, damit die Textbausteine für sich prüfbar bleiben. Im Versand
   * fehlt er nie: `deliverEmail()` lässt eine werbliche Nachricht ohne
   * funktionierenden Abmeldeweg gar nicht erst durch.
   */
  unsubscribeUrl?: string | null;
}): string[] {
  const herkunft = input.sourceUrl
    ? `Ihrer öffentlichen Ausschreibung (${input.sourceUrl})`
    : "einer von Ihnen veröffentlichten Projektausschreibung";

  return [
    "—",
    ...PROVIDER_IMPRINT_LINES,
    // Absender- und Impressumsadresse sind zurzeit dieselbe. Zweimal
    // hintereinander sah nach einem Fehler aus, und das war es auch.
    input.senderEmail.trim().toLowerCase() === IMPRINT_EMAIL.toLowerCase()
      ? `${IMPRINT_EMAIL} · ${IMPRINT_URL}`
      : `${input.senderEmail} · ${IMPRINT_EMAIL} · ${IMPRINT_URL}`,
    "",
    // Die konkrete Quelle bleibt in der Nachricht stehen: Sie ist der Teil
    // der Auskunft nach Art. 14 DSGVO, den eine allgemeine Datenschutzseite
    // gerade nicht liefern kann. Zweck, Rechtsgrundlage, Speicherdauer und
    // Betroffenenrechte stehen dort und werden hier nur verlinkt — die
    // gestufte Form, die die Transparenzleitlinien ausdrücklich zulassen.
    `Ihre Kontaktdaten stammen aus ${herkunft}. Zweck, Rechtsgrundlage, Speicherdauer und Ihre Rechte auf Auskunft, Berichtigung, Löschung und Widerspruch: ${PRIVACY_URL}`,
    ...(input.unsubscribeUrl
      ? [
          "",
          "Wenn Sie keine weiteren E-Mails von uns erhalten möchten, genügt ein Klick:",
          input.unsubscribeUrl,
        ]
      : [
          "",
          `Wenn Sie keine weiteren E-Mails von uns erhalten möchten, genügt eine formlose Antwort an ${input.senderEmail}.`,
        ]),
  ];
}

/**
 * Die eigene Domain und die Adresse des Absenders. Alles andere hat im
 * Werbetext nichts verloren.
 */
const ERLAUBTE_HOSTS = ["x-portal.eu", "www.x-portal.eu"];

const LINK_PATTERN = /https?:\/\/[^\s<>"]+/giu;
const MAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/giu;

/**
 * Ein Satzzeichen am Ende gehört nicht zur Adresse. Ohne diesen Schnitt läse
 * die Prüfung „vertrieb@example.com." als fremde Adresse und hielte den eigenen
 * Absender auf — dieselbe Falle wie bei `leadSourceUrl`.
 */
function ohneSatzzeichen(wert: string): string {
  return wert.replace(/[).,;:!?"'»]+$/u, "");
}

/**
 * Prüft, ob ein Modelltext ohne menschliche Sicht verschickt werden darf.
 *
 * Der Ausschreibungstext ist Fremdmaterial von einer Projektbörse. Wer ihn
 * dort einstellt, kann eine Anweisung hineinschreiben — und ein Modell, das
 * ihr folgt, würde eine fremde Adresse oder einen fremden Link in die
 * Nachricht setzen, die dann unter unserem Namen an den Empfänger geht.
 *
 * Beim Einzelversand liest der Betreiber den Text, bevor er auf Senden
 * drückt; da ist das abgedeckt. Beim Stapel liest niemand mit, deshalb gilt
 * dort die einfachste haltbare Regel: der Werbetext enthält überhaupt keine
 * Adresse und keinen Link außer denen auf die eigene Domain. Er braucht
 * auch keine — die Quelle steht im Fuß, und der entsteht in diesem Modul.
 */
export function unattendedBodyIssue(
  body: string,
  senderEmail: string,
): string | null {
  for (const roh of body.match(LINK_PATTERN) ?? []) {
    const treffer = ohneSatzzeichen(roh);
    let host: string;
    try {
      host = new URL(treffer).hostname.toLowerCase();
    } catch {
      return "Der Text enthält eine unlesbare Adresse.";
    }
    if (!ERLAUBTE_HOSTS.includes(host)) {
      return `Der Text verweist auf ${host} — beim Stapelversand sind nur Links auf die eigene Domain zugelassen.`;
    }
  }

  for (const roh of body.match(MAIL_PATTERN) ?? []) {
    const treffer = ohneSatzzeichen(roh);
    if (treffer.toLowerCase() !== senderEmail.trim().toLowerCase()) {
      return `Der Text nennt die fremde Adresse ${treffer} — beim Stapelversand ist nur die Absenderadresse zugelassen.`;
    }
  }

  return null;
}

/**
 * Setzt Anrede, Text, Handlungsaufforderung und Fuß zusammen.
 *
 * Der Modelltext wird dabei entschärft: eine Anrede oder Grußformel, die es
 * trotz Anweisung mitgeliefert hat, stünde sonst doppelt.
 *
 * Die Grußformel nennt neben dem Namen das Portal. Aus den ersten hundert
 * Nachrichten kam die Rückmeldung, dass mindestens ein Empfänger den
 * Suchassistenten für den Absender persönlich hielt und ihn im Chat mit Namen
 * ansprach. Das ist kein Einzelfehler, sondern eine Folge des Aufbaus: Wenn
 * eine Nachricht durchgehend „ich" sagt und nirgends erklärt, dass dahinter
 * ein Werkzeug steht, ist die Verwechslung die naheliegende Lesart.
 */
export function buildLeadEmail(input: LeadMessageInput): string {
  const body =
    input.trimModelPhrases === false
      ? input.body.trim()
      : stripSalutationAndSignoff(input.body);
  return [
    salutation(input.recipientName, input.company),
    "",
    body,
    ...(input.ctaUrl
      ? [
          "",
          "Ihre Rolle ist im Portal schon eingetragen — Profile ansehen:",
          input.ctaUrl,
        ]
      : []),
    "",
    "Viele Grüße",
    `${SENDER_PERSON} — XPORTAL`,
    "",
    ...legalFooter({
      senderEmail: input.senderEmail,
      sourceUrl: input.sourceUrl,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  ].join("\n");
}

/**
 * Die Nachricht, die den Kreis schließt: zu dieser Ausschreibung gibt es
 * eingetragene Freelancer, und hier stehen die Eckdaten des bestpassenden.
 *
 * Ohne Namen. Der Name steht auf dem öffentlichen Profil, aber ihn
 * unaufgefordert in eine Werbemail an einen Dritten zu setzen, ist etwas
 * anderes als ihn auf einer Seite zu zeigen, die jemand selbst aufruft —
 * und es umgeht `POST /api/introductions`, wo der Kontaktwunsch sonst
 * bewusst an ein zuvor angezeigtes Profil gebunden ist. Rolle, belegte
 * Kompetenzen, Arbeitsweise und Verfügbarkeit tragen die Nachricht ohnehin.
 *
 * Seit dem 28. September 2026 führt die Nachricht trotzdem direkt zum
 * Kalender des Profils (`leadBookingUrl`), auf Romans Wunsch: Wer die
 * Eckdaten und den Abgleich gelesen hat, soll ohne Umweg über ein Konto
 * einen Termin wählen können. Der Name bleibt draußen; die Buchungsseite
 * zeigt ihn erst dem, der sie aufruft.
 *
 * Kein Modelltext: Was hier steht, kommt vollständig aus dem Profil und aus
 * dem Ergebnis von `buildShortlist()`. Ein Modell könnte hier nichts
 * hinzufügen, aber einiges erfinden.
 */
export type MatchFacts = {
  role: string;
  /** Nur belegte Kompetenzen — selbst angegebene tragen keine Zusage. */
  verifiedSkills: readonly string[];
  workModes: readonly string[];
  location: string | null;
  availabilityStatus: "available" | "limited" | "unavailable" | "unknown";
  availableFrom: string | null;
  /**
   * Wann der Freelancer die Verfügbarkeit zuletzt angegeben hat. Ohne das
   * Datum las sich „verfügbar“ wie eine Zusage von heute, auch wenn die
   * Angabe Wochen alt war.
   */
  availabilityCheckedAt?: string | null;
  hourlyRate: { amount: number; currency: string } | null;
};

const VERFUEGBARKEIT: Readonly<Record<MatchFacts["availabilityStatus"], string>> = {
  available: "verfügbar",
  limited: "eingeschränkt verfügbar",
  unavailable: "derzeit nicht verfügbar",
  unknown: "Verfügbarkeit auf Anfrage",
};

function datumDe(iso: string | null): string | null {
  if (!iso) return null;
  const [jahr, monat, tag] = iso.split("-");
  return jahr && monat && tag ? `${tag}.${monat}.${jahr}` : null;
}

function eckdaten(fakten: MatchFacts): string[] {
  const zeilen: [string, string][] = [["Rolle", fakten.role]];
  if (fakten.verifiedSkills.length) {
    zeilen.push([
      "Kompetenzen",
      `${fakten.verifiedSkills.slice(0, 5).join(", ")} (im Profil belegt)`,
    ]);
  }
  const arbeitsweise = [
    fakten.workModes.length ? fakten.workModes.join(", ") : null,
    fakten.location,
  ].filter(Boolean);
  if (arbeitsweise.length) zeilen.push(["Arbeitsweise", arbeitsweise.join(" · ")]);

  const ab = datumDe(fakten.availableFrom);
  const stand =
    fakten.availabilityStatus === "unknown"
      ? null
      : datumDe(fakten.availabilityCheckedAt?.slice(0, 10) ?? null);
  const verfuegbarkeit =
    ab && fakten.availabilityStatus !== "unknown"
      ? `${VERFUEGBARKEIT[fakten.availabilityStatus]} ab ${ab}`
      : VERFUEGBARKEIT[fakten.availabilityStatus];
  zeilen.push([
    "Verfügbarkeit",
    stand ? `${verfuegbarkeit} (Stand ${stand})` : verfuegbarkeit,
  ]);

  zeilen.push([
    "Stundensatz",
    fakten.hourlyRate
      ? `${fakten.hourlyRate.amount} ${fakten.hourlyRate.currency}`
      : "im Profil nicht angegeben",
  ]);

  const breite = Math.max(...zeilen.map(([k]) => k.length));
  return zeilen.map(([k, v]) => `  ${(k + ":").padEnd(breite + 2)}${v}`);
}

/**
 * Eine Anforderung aus der Ausschreibung und was das Profil dazu belegt.
 *
 * Strukturell statt als Import aus dem Matching: Die Nachricht braucht nur
 * diese Felder, und so bleibt sie ohne die Rangliste prüfbar.
 */
export type RequirementCheck = {
  category: "skill" | "language" | "work_mode" | "location" | "qualification" | "contractual";
  priority: "hard" | "core" | "optional";
  operator: "all_of" | "any_of";
  values: readonly string[];
  status: "satisfied" | "contradicted" | "unknown";
  evidence: "verified" | "self_reported" | "structured" | "unknown";
};

const MAX_ABGLEICH_ZEILEN = 6;

const KATEGORIE_PRAEFIX: Readonly<Partial<Record<RequirementCheck["category"], string>>> = {
  language: "Sprache: ",
  work_mode: "Arbeitsweise: ",
  location: "Ort: ",
};

function abgleichErgebnis(check: RequirementCheck): string {
  if (check.status === "contradicted") return "passt nicht";
  if (check.status === "unknown") return "nicht belegt – im Erstgespräch klären";
  if (check.evidence === "verified") return "im Profil belegt";
  if (check.evidence === "self_reported") return "laut Profil";
  return "passt";
}

/**
 * Der Abgleich in Zeilen: was die Ausschreibung verlangt und was das Profil
 * dazu hergibt. Das ist die Suche, mit der XPORTAL das Profil gefunden hat —
 * der Empfänger sieht, warum es passt, und ebenso, was offen ist.
 *
 * Muss- und Kernanforderungen zuerst, ergänzende danach; vertragliche
 * Bedingungen bleiben draußen, weil sie ins Gespräch gehören und nicht in
 * eine erste Nachricht. Höchstens sechs Zeilen, damit die Nachricht lesbar
 * bleibt.
 */
export function requirementLines(checks: readonly RequirementCheck[]): string[] {
  const rang = { hard: 0, core: 1, optional: 2 } as const;
  const zeilen = checks
    .filter((check) => check.category !== "contractual" && check.values.length > 0)
    .sort((a, b) => rang[a.priority] - rang[b.priority])
    .slice(0, MAX_ABGLEICH_ZEILEN)
    .map((check) => {
      const werte = check.values.join(check.operator === "any_of" ? " oder " : ", ");
      const label = `${KATEGORIE_PRAEFIX[check.category] ?? ""}${werte}${
        check.priority === "optional" ? " (optional)" : ""
      }`;
      const zeichen =
        check.status === "satisfied" ? "✓" : check.status === "contradicted" ? "✗" : "?";
      return { zeichen, label, ergebnis: abgleichErgebnis(check) };
    });
  const breite = Math.max(0, ...zeilen.map((zeile) => zeile.label.length));
  return zeilen.map(
    ({ zeichen, label, ergebnis }) => `  ${zeichen} ${label.padEnd(breite + 2)}${ergebnis}`,
  );
}

/**
 * Der direkte Weg zum Kalender des Freelancers, ohne Anmeldung.
 *
 * Er führt über die eigene Domain und nicht auf die Buchungsseite selbst:
 * `/api/freelancers/<id>/book` prüft, ob das Profil noch aktiv und buchbar
 * ist, zählt den Klick und leitet erst dann weiter. `via=lead` ordnet den
 * Klick der Akquise-Mail zu. Die Sperre für den Stapelversand lässt nur Links
 * auf x-portal.eu durch, und genau so einer ist es.
 */
export function leadBookingUrl(input: {
  origin: string;
  profileId: string;
}): string | null {
  try {
    const url = new URL(
      `/api/freelancers/${encodeURIComponent(input.profileId)}/book`,
      input.origin,
    );
    url.searchParams.set("via", "lead");
    return url.toString();
  } catch {
    return null;
  }
}

/** „und 1 weiteres kommt infrage" / „und 2 weitere kommen infrage". */
function weitereProfile(anzahl: number): string {
  if (anzahl <= 0) return "";
  return anzahl === 1
    ? ", dazu kommt 1 weiteres infrage"
    : `, dazu kommen ${anzahl} weitere infrage`;
}

export function buildMatchEmail(input: {
  recipientName: string | null;
  company: string | null;
  senderEmail: string;
  sourceUrl: string | null;
  unsubscribeUrl?: string | null;
  /** Die Überschrift der Ausschreibung, wie sie der Empfänger geschrieben hat. */
  headline: string;
  /** Wie viele Profile die Rangliste als verlässlich passend geführt hat. */
  matchCount: number;
  best: MatchFacts;
  /** Die Anforderungen aus der Ausschreibung, geprüft am besten Profil. */
  requirements?: readonly RequirementCheck[];
  /** Direkter Buchungsweg über x-portal.eu; fehlt, wenn das Profil keinen hat. */
  bookingUrl?: string | null;
  ctaUrl: string;
}): string {
  const weitere = input.matchCount - 1;
  const abgleich = requirementLines(input.requirements ?? []);
  return [
    salutation(input.recipientName, input.company),
    "",
    `für Ihre Ausschreibung „${input.headline}" haben wir auf XPORTAL ein passendes Profil gefunden${weitereProfile(weitere)}.`,
    "",
    "Das Profil:",
    "",
    ...eckdaten(input.best),
    ...(abgleich.length
      ? ["", "So haben wir Ihre Ausschreibung abgeglichen:", "", ...abgleich]
      : []),
    ...(input.bookingUrl
      ? [
          "",
          "Erstgespräch direkt im Kalender buchen, ohne Anmeldung:",
          input.bookingUrl,
        ]
      : []),
    "",
    weitere > 0
      ? "Alle passenden Profile mit vollständiger Begründung ansehen:"
      : "Das Profil mit vollständiger Begründung ansehen:",
    input.ctaUrl,
    "",
    "Das Ansehen der Profile ist kostenlos. Der Termin ist ein Erstgespräch, noch keine Beauftragung.",
    "",
    "Viele Grüße",
    `${SENDER_PERSON} — XPORTAL`,
    "",
    ...legalFooter({
      senderEmail: input.senderEmail,
      sourceUrl: input.sourceUrl,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  ].join("\n");
}

export function buildMatchSubject(input: {
  matchCount: number;
  headline: string;
}): string {
  const rolle = input.headline.trim().slice(0, 120);
  return input.matchCount === 1
    ? `Ein verfügbarer Freelancer für „${rolle}"`
    : `${input.matchCount} verfügbare Freelancer für „${rolle}"`;
}

/**
 * Der Link ins Portal, mit der ausgeschriebenen Rolle als Suchbegriff.
 *
 * Der bisherige Abschluss war eine Frage („Darf ich Ihnen ein Profil
 * schicken?"). Sie verlangt eine Antwort und danach Warten — bei sieben
 * Antworten auf hundert Nachrichten ist das der Engpass, nicht der Wortlaut
 * davor. Ein Link kostet einen Klick und zeigt sofort etwas.
 *
 * Nur die Überschrift der Ausschreibung wandert hinein, nicht der ganze Text:
 * Sie ist der Teil, den der Empfänger selbst formuliert hat, und alles Weitere
 * würde die Adresse unlesbar lang machen.
 */
export function leadSearchUrl(input: {
  origin: string;
  headline: string;
}): string | null {
  const rolle = input.headline.trim().slice(0, 120);
  if (!rolle) return null;
  try {
    const url = new URL("/chat", input.origin);
    url.searchParams.set("q", rolle);
    url.searchParams.set("entry", "recruiter");
    return url.toString();
  } catch {
    return null;
  }
}

const SALUTATION_PATTERN =
  /^\s*(sehr geehrte[rs]?\b[^\n]*|guten tag\b[^\n]*|hallo\b[^\n]*|liebe[rs]?\b[^\n]*)[,:]?\s*\n+/iu;
const SIGNOFF_PATTERN =
  /\n+\s*(viele grüße|beste grüße|mit freundlichen grüßen|herzliche grüße|freundliche grüße)[^]*$/iu;

export function stripSalutationAndSignoff(body: string): string {
  return body
    .replace(SALUTATION_PATTERN, "")
    .replace(SIGNOFF_PATTERN, "")
    .trim();
}
