/**
 * Die Adresse einer recherchierten Person — und die Frage, ob wir sie benutzen
 * dürfen.
 *
 * freelancermap veröffentlicht keine Adressen. Der Weg dorthin führt über die
 * eigene Seite der Person und deren Impressum, das nach § 5 DDG ohnehin eine
 * Adresse enthalten muss. Damit steht am Ende oft eine Adresse da — aber nicht
 * jede gehört der Person.
 *
 * **Die Regel, um die es hier geht:** Wer als Angestellter bei einer Firma
 * arbeitet und nebenher freiberuflich tätig ist, wird nicht über das
 * allgemeine Postfach seines Arbeitgebers angeschrieben. Das Postfach gehört
 * dem Arbeitgeber; eine Projektanfrage an seinen Freelancer-Nebenerwerb hat
 * dort nichts zu suchen und kann der Person schaden.
 *
 * Die Ausnahme ist die Firma, die Projekte **im Team** übernimmt: Dort ist die
 * allgemeine Adresse der richtige Weg, und die Ansprache darf persönlich sein.
 *
 * Woran das unterschieden wird, ohne zu raten: **Steht die Person selbst im
 * Impressum?** Wer dort als Inhaber, Geschäftsführer, Vertretungsberechtigter
 * oder inhaltlich Verantwortlicher genannt ist, dem gehört das Postfach — sei
 * es sein Einzelunternehmen oder seine Projektfirma. Wer dort nicht steht, ist
 * für diese Seite ein Dritter, und dann fassen wir das Postfach nicht an.
 */

import { htmlToText } from "./html-text";

/**
 * Umlaute und ß auf ihre Ersatzschreibung bringen.
 *
 * Diese Form ist die Vergleichsform des ganzen Moduls — Impressumstexte,
 * Namen und die Wortlisten unten laufen alle durch sie. Anfangs tat das nur
 * der Text, und die Liste unten stand mit Umlauten da: „Geschäftsführer" wurde
 * dadurch **nie** gefunden, weil im normalisierten Text „geschaeftsfuehrer"
 * steht. Ein Impressum mit einem fremden Geschäftsführer galt damit als
 * Einzelunternehmen.
 */
function entumlaute(value: string): string {
  return value
    .toLocaleLowerCase("de-DE")
    .replace(/ß/gu, "ss")
    .replace(/ä/gu, "ae")
    .replace(/ö/gu, "oe")
    .replace(/ü/gu, "ue")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Rollen, die jemanden zum Verantwortlichen der Seite machen. */
const VERANTWORTLICH = [
  "inhaber",
  "inhaberin",
  "geschäftsführer",
  "geschäftsführerin",
  "vertreten durch",
  "vertretungsberechtigt",
  "verantwortlich",
  "eigentümer",
  "betreiber",
  "gesellschafter",
  "vorstand",
  "owner",
  "managing director",
].map(entumlaute);

/** Postfächer, die niemandem persönlich gehören. */
const ROLLEN_POSTFAECHER = [
  "info",
  "kontakt",
  "contact",
  "office",
  "mail",
  "email",
  "hello",
  "hallo",
  "service",
  "support",
  "anfrage",
  "anfragen",
  "post",
  "team",
  "welcome",
  "moin",
  "sales",
  "vertrieb",
  "empfang",
  "buero",
  "büro",
  "admin",
  "webmaster",
  "presse",
  "marketing",
];

/** Postfächer, die nie zu einer Projektanfrage passen. */
const GESPERRTE_POSTFAECHER = [
  "bewerbung",
  "bewerbungen",
  "jobs",
  "karriere",
  "career",
  "careers",
  "recruiting",
  "hr",
  "personal",
  "datenschutz",
  "privacy",
  "dpo",
  "abuse",
  "postmaster",
  "noreply",
  "no-reply",
  "donotreply",
  "buchhaltung",
  "rechnung",
  "invoice",
  "billing",
];

const MAIL_MUSTER = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}/gu;

/**
 * Verschleierte Adressen lesbar machen.
 *
 * „name AT firma DOT de" ist keine Spamfalle, sondern der Versuch, von
 * Sammlern verschont zu bleiben. Wer sie so schreibt, will trotzdem erreichbar
 * sein — nur nicht maschinell. Wir lesen sie, weil wir gleich darauf prüfen,
 * ob die Adresse überhaupt zur Person gehört.
 */
export function deobfuscateEmails(text: string): string {
  return text
    .replace(/\s*\(\s*at\s*\)\s*|\s*\[\s*at\s*\]\s*|\s+at\s+|\s*\{\s*at\s*\}\s*/giu, "@")
    .replace(/\s*\(\s*dot\s*\)\s*|\s*\[\s*dot\s*\]\s*|\s+dot\s+|\s*\{\s*punkt\s*\}\s*/giu, ".")
    .replace(/\s*\(\s*punkt\s*\)\s*|\s*\[\s*punkt\s*\]\s*/giu, ".");
}

/** Alle Adressen aus einem Text, entdoppelt und kleingeschrieben. */
export function extractEmails(text: string): string[] {
  const lesbar = deobfuscateEmails(text);
  const gefunden = new Set<string>();
  for (const treffer of lesbar.match(MAIL_MUSTER) ?? []) {
    const wert = treffer.toLowerCase().replace(/[.,;:)]+$/u, "");
    // Bilddateien und Ähnliches sehen wie Adressen aus, sind aber keine.
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/u.test(wert)) continue;
    gefunden.add(wert);
  }
  return [...gefunden];
}

/** Die Namensbestandteile einer Person, vergleichbar gemacht. */
function namensteile(displayName: string): string[] {
  return entumlaute(displayName)
    .split(/\s+/u)
    .map((teil) => teil.replace(/[^a-z]/gu, ""))
    .filter((teil) => teil.length >= 2);
}

/**
 * Rechtsformen. Ihr Vorhandensein macht aus einem Impressum das einer Firma,
 * ihr Fehlen das eines Einzelunternehmers.
 */
const RECHTSFORMEN =
  /\b(gmbh|mbh|ug\b|\bag\b|kgaa|\bkg\b|\bohg\b|gbr|e\.?\s?k\.?|ltd\b|limited\b|inc\b|s\.?a\.?r\.?l|b\.?v\.?|e\.?\s?v\.?|se\b|partg|mbb)\b/u;

/**
 * Trägt die Domain den Namen der Person?
 *
 * `nikolai-schankin.de` ist der eindeutigste Beleg, den es gibt: Niemand
 * betreibt eine Seite unter dem Namen eines anderen. Das schlägt jedes
 * Textmerkmal im Impressum — und es war der Fall, an dem die erste Fassung
 * dieser Prüfung gescheitert ist.
 */
export function domainCarriesName(input: {
  domain: string;
  displayName: string;
}): boolean {
  const host = input.domain.toLowerCase().replace(/^www\./u, "");
  // Nur der Name selbst, ohne Endung: `schankin-it.de` → `schankin-it`.
  const kern = host.split(".").slice(0, -1).join(".").replace(/[^a-z]/gu, "");
  if (!kern) return false;

  const teile = namensteile(input.displayName);
  const nachname = teile.at(-1);
  if (!nachname || nachname.length < 4) return false;
  // Der Nachname allein in der Domain genügt: `schankin-it.de` gehört einem
  // Schankin. Ein Vorname allein täte es nicht.
  return kern.includes(nachname);
}

/**
 * Steht die Person im Impressum, und zwar als jemand, dem die Seite gehört?
 *
 * Drei Wege, in dieser Reihenfolge:
 *
 * 1. **Der Nachname in der Nähe einer Rollenbezeichnung** — „Vertreten durch:
 *    Nikolai Schankin", „Klaus Groß, Inhaber".
 * 2. **Das Impressum eines Einzelunternehmers.** Nach § 5 DDG besteht es nur
 *    aus Name und Anschrift; eine Rollenbezeichnung kommt darin gar nicht vor,
 *    weil es keine Gesellschaft gibt, die vertreten werden müsste. Erkennbar
 *    daran, dass der volle Name dasteht und **keine Rechtsform** genannt ist.
 *
 * Der bloße Name irgendwo auf einer Firmenseite genügt weiterhin nicht — er
 * könnte in einer Mitarbeiterliste oder einem Projektbericht stehen. Genau
 * deshalb hängt Weg 2 an der fehlenden Rechtsform.
 */
export function personRunsSite(input: {
  imprintText: string;
  displayName: string;
}): boolean {
  const text = entumlaute(input.imprintText);

  const teile = namensteile(input.displayName);
  const nachname = teile.at(-1);
  if (!nachname || nachname.length < 3) return false;

  // Satzweise statt in einem Zeichenfenster.
  //
  // Ein Fenster von hundert Zeichen um das Rollenwort schien naheliegend und
  // war falsch: „Unser Team: Nikolai Schankin, Petra Baumann. Geschäftsführer:
  // Klaus Groß." liegt vollständig darin, und Schankin galt als
  // Geschäftsführer. Ein Satz ist die Einheit, die zusammengehört —
  // „Vertreten durch: X" steht in einem, die Teamliste in einem anderen.
  const saetze = text.split(/[.;\n|·•]+/u);
  let rollenwortGesehen = false;
  const nameMuster = new RegExp(`\\b${nachname}\\b`, "u");
  for (const satz of saetze) {
    const rolle = VERANTWORTLICH.find((wert) => satz.includes(wert));
    if (!rolle) continue;
    rollenwortGesehen = true;
    if (nameMuster.test(satz)) return true;
  }

  // Weg 2: das Impressum eines Einzelunternehmers. Voller Name vorhanden,
  // keine Rechtsform genannt — und **keine Rollenbezeichnung**.
  //
  // Die letzte Bedingung ist die wichtigste: Nennt das Impressum überhaupt
  // einen Verantwortlichen, dann hat Weg 1 ihn bereits geprüft und die Person
  // war es nicht. Sie steht dort in anderer Eigenschaft — im Team, im
  // Projektbericht — und das Postfach gehört ihr nicht.
  if (rollenwortGesehen) return false;
  if (RECHTSFORMEN.test(text)) return false;
  const vorname = teile[0];
  if (!vorname || vorname === nachname) return false;
  const vollerName = new RegExp(`\\b${vorname}\\s+\\S*\\s*${nachname}\\b|\\b${vorname}\\s+${nachname}\\b`, "u");
  return vollerName.test(text);
}

export type AddressKind = "personal" | "role" | "blocked";

export type AddressVerdict =
  /** Gehört der Person; darf angeschrieben werden. */
  | "usable"
  /** Allgemeines Postfach einer Firma, in deren Impressum die Person steht. */
  | "usable_team"
  /** Allgemeines Postfach eines Dritten — der Arbeitgeberfall. Nicht benutzen. */
  | "third_party_mailbox"
  /** Postfach für einen anderen Zweck (Bewerbungen, Datenschutz, Buchhaltung). */
  | "wrong_purpose"
  /** Die Adresse liegt nicht auf der besuchten Domain. */
  | "foreign_domain";

export type AddressAssessment = {
  email: string;
  kind: AddressKind;
  verdict: AddressVerdict;
  /** In einem Satz, warum. Steht später in der Arbeitsliste. */
  reason: string;
};

function localPart(email: string): string {
  return email.slice(0, email.lastIndexOf("@")).toLowerCase();
}

function domainOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return null;
  }
}

/** Gehören zwei Hosts zur selben Seite? `blog.firma.de` und `firma.de` schon. */
function sameSite(links: string, rechts: string): boolean {
  return (
    links === rechts || links.endsWith(`.${rechts}`) || rechts.endsWith(`.${links}`)
  );
}

/**
 * Darf diese Adresse für eine Projektanfrage benutzt werden?
 *
 * Die Reihenfolge der Prüfungen ist die Reihenfolge der Ausschlussgründe:
 * fremde Domain, falscher Zweck, dann die Frage nach dem Eigentümer.
 */
export function assessAddress(input: {
  email: string;
  displayName: string;
  /** Die Seite, auf der die Adresse stand. */
  pageUrl: string;
  /** Der Impressumstext derselben Seite. */
  imprintText: string;
}): AddressAssessment {
  const email = input.email.trim().toLowerCase();
  const lokal = localPart(email);
  const mailDomain = email.slice(email.lastIndexOf("@") + 1);
  const seiteDomain = domainOf(input.pageUrl);

  if (!seiteDomain || !sameSite(mailDomain, seiteDomain)) {
    return {
      email,
      kind: "role",
      verdict: "foreign_domain",
      reason: `Die Adresse liegt auf ${mailDomain}, die Seite auf ${seiteDomain ?? "unbekannt"}.`,
    };
  }

  const tokens = lokal.split(/[^a-z0-9]+/u).filter(Boolean);
  if (tokens.some((token) => GESPERRTE_POSTFAECHER.includes(token))) {
    return {
      email,
      kind: "blocked",
      verdict: "wrong_purpose",
      reason: "Das Postfach ist für einen anderen Zweck gedacht.",
    };
  }

  const teile = namensteile(input.displayName);
  const nachname = teile.at(-1);
  const vorname = teile[0];
  const kompakt = teile.join("");
  const lokalKompakt = lokal.replace(/[^a-z]/gu, "");

  const istRollenpostfach = tokens.some((token) =>
    ROLLEN_POSTFAECHER.includes(token),
  );
  // Die Domain zuerst: Sie ist der stärkere Beleg und kostet keine Textsuche.
  const gehoertIhr =
    domainCarriesName({ domain: mailDomain, displayName: input.displayName }) ||
    personRunsSite({
      imprintText: input.imprintText,
      displayName: input.displayName,
    });

  // Der Nachname bindet die Adresse an die Person, egal wo sie liegt.
  const nachnameTrifft =
    Boolean(nachname) &&
    (tokens.some((token) => token === nachname) ||
      lokalKompakt === kompakt ||
      lokalKompakt.includes(nachname!));

  // Der Vorname allein genügt sonst nicht — „max@" träfe zu viele. Auf einer
  // Seite, die der Person nachweislich gehört, ist es dagegen eindeutig: Dort
  // gibt es keinen zweiten Nikolai, dem das Postfach gehören könnte.
  const vornameTrifft =
    gehoertIhr &&
    Boolean(vorname) &&
    !istRollenpostfach &&
    tokens.some((token) => token === vorname);

  if (nachnameTrifft || vornameTrifft) {
    return {
      email,
      kind: "personal",
      verdict: "usable",
      reason: nachnameTrifft
        ? "Die Adresse trägt den Namen der Person."
        : "Die Adresse trägt ihren Vornamen, und die Seite gehört ihr.",
    };
  }

  if (gehoertIhr) {
    const ueberDomain = domainCarriesName({
      domain: mailDomain,
      displayName: input.displayName,
    });
    return {
      email,
      kind: istRollenpostfach ? "role" : "personal",
      verdict: "usable_team",
      reason: ueberDomain
        ? `Allgemeines Postfach, aber die Domain ${mailDomain} trägt den Namen der Person.`
        : "Allgemeines Postfach, aber die Person ist im Impressum als " +
          "Verantwortliche genannt — es ist ihre eigene Firma.",
    };
  }

  return {
    email,
    kind: "role",
    verdict: "third_party_mailbox",
    reason:
      "Allgemeines Postfach einer Firma, in deren Impressum die Person nicht " +
      "steht. Vermutlich ihr Arbeitgeber — dort schreiben wir sie nicht an.",
  };
}

/** Nur die Adressen, die benutzt werden dürfen, beste zuerst. */
export function usableAddresses(
  assessments: readonly AddressAssessment[],
): AddressAssessment[] {
  const rang: Record<AddressVerdict, number> = {
    usable: 0,
    usable_team: 1,
    third_party_mailbox: 9,
    wrong_purpose: 9,
    foreign_domain: 9,
  };
  return assessments
    .filter((wert) => wert.verdict === "usable" || wert.verdict === "usable_team")
    .sort((links, rechts) => rang[links.verdict] - rang[rechts.verdict]);
}

/** Die üblichen Pfade eines Impressums, in der Reihenfolge der Wahrscheinlichkeit. */
export const IMPRINT_PATHS = [
  "/impressum",
  "/impressum.html",
  "/imprint",
  "/legal",
  "/legal-notice",
  "/kontakt",
  "/contact",
  "/about",
  "/ueber-mich",
] as const;

/** Ein Link auf das Impressum, aus dem HTML einer Seite. */
export function findImprintUrl(html: string, baseUrl: string): string | null {
  const muster =
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/giu;
  for (const treffer of html.matchAll(muster)) {
    // Die Beschriftung durch dieselbe Umwandlung wie jeden anderen Text: Ein
    // eigenes `replace(/<[^>]+>/)` an dieser Stelle war unvollständig und
    // hätte `&lt;` stehen lassen, wo „Impressum" gemeint war.
    const beschriftung = htmlToText(treffer[2]!).toLowerCase();
    const ziel = treffer[1]!;
    if (
      /impressum|imprint|legal\s*notice|rechtliches/u.test(beschriftung) ||
      /\/(impressum|imprint|legal-notice)\b/u.test(ziel.toLowerCase())
    ) {
      try {
        return new URL(ziel, baseUrl).toString();
      } catch {
        // Ein unlesbarer Link wird übergangen.
      }
    }
  }
  return null;
}
