import { proofSource } from "./proof-sources";

/**
 * Die drei Beispiele der Praxisseite (/praxis): was andere Unternehmen mit KI
 * schon umsetzen. Nur echte Fälle mit Quelle oder unser eigenes Produkt —
 * erfundene Referenzen wären irreführende Werbung (§ 5 UWG).
 *
 * - Vodafone UK: Fallstudie von n8n (Zahlen und Zitat von dort, übersetzt).
 * - XPORTAL: der eigene Talent Index, live auf der Startseite.
 * - Lufthansa Industry Solutions: Whitepaper „Agentic AI“ (Mai 2025), S. 4
 *   (Zitat Julian Staub) und S. 9 (Kundenprojekte, Disponenten).
 *
 * `interest` ist der Schlüssel, den die Seite beim Klick auf „Das will ich
 * auch“ zählt; er steht im Protokoll, nicht der Text.
 */

export const PRAXIS_INTERESTS = [
  { key: "ueberwachung", label: "Überwachung" },
  { key: "anfragen", label: "Anfragen" },
  { key: "servicewissen", label: "Servicewissen" },
] as const;

export type PraxisInterest = (typeof PRAXIS_INTERESTS)[number]["key"];

export function isPraxisInterest(value: unknown): value is PraxisInterest {
  return typeof value === "string" && PRAXIS_INTERESTS.some((interest) => interest.key === value);
}

export function praxisInterestLabel(key: PraxisInterest): string {
  return PRAXIS_INTERESTS.find((interest) => interest.key === key)!.label;
}

/** „Anfragen“, „Anfragen und Servicewissen“, „A, B und C“. */
export function joinGerman(items: readonly string[]): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} und ${items.at(-1)}`;
}

export type PraxisCase = {
  interest: PraxisInterest;
  mark: string;
  tag: string;
  headline: string;
  stats?: readonly { value: string; label: string }[];
  uses?: { label: string; items: readonly string[] };
  quote?: { text: string; by: string };
  source: { label: string; href: string; external: boolean };
  visual: "monitor" | "talent" | "answer";
  transfer: string;
};

const CASES: readonly PraxisCase[] = [
  {
    interest: "ueberwachung",
    mark: "VODAFONE",
    tag: "Telekommunikation · Vodafone UK",
    headline: "5.000 Personentage gespart.",
    stats: [
      { value: "2,2 Mio. £", label: "Kosten vermieden" },
      { value: "33", label: "automatisierte Abläufe seit August 2024" },
      { value: "alle 5 Min.", label: "kritische Datenquellen geprüft" },
    ],
    quote: {
      text: "„Es hat alles gemacht, was wir wollten, alles in einem Werkzeug.“",
      by: "Claire Van Hinsbergh, Engineering Manager, Vodafone (übersetzt)",
    },
    source: { label: "Quelle: Fallstudie von n8n", href: proofSource("Vodafone").href, external: true },
    visual: "monitor",
    transfer: "Anlagen, Systeme oder Lieferungen rund um die Uhr prüfen, Tickets automatisch anlegen, die Zuständigen sofort informieren.",
  },
  {
    interest: "anfragen",
    mark: "XPORTAL",
    tag: "Bei uns selbst umgesetzt · Talent Index",
    headline: "Jede Anfrage gegen {profiles} abgeglichen.",
    stats: [
      { value: "{count}", label: "freigegebene Profile" },
      { value: "jede", label: "Empfehlung mit Begründung" },
      { value: "live", label: "auf unserer Startseite" },
    ],
    source: { label: "Live ausprobieren", href: "/#demo", external: false },
    visual: "talent",
    transfer: "Kunden- und Ersatzteilanfragen lesen, im System nachsehen, die Antwort vorbereiten. Ihr Team prüft und sendet.",
  },
  {
    interest: "servicewissen",
    mark: "LUFTHANSA",
    tag: "Lufthansa Industry Solutions · Whitepaper 2025",
    headline: "Was früher Disponenten erledigt haben, läuft zunehmend automatisch.",
    uses: {
      label: "Bei Kunden von Lufthansa Industry Solutions im Einsatz",
      items: ["Chatbots im Service", "Nachbestellung in der Lieferkette", "Paketverfolgung in Echtzeit"],
    },
    quote: {
      text: "„Selbst kleinere Unternehmen können und sollten Agenten einsetzen, um ihre internen Prozesse zu optimieren.“",
      by: "Julian Staub, Business Director Intelligent Process Automation, Lufthansa Industry Solutions",
    },
    source: { label: "Quelle: Whitepaper „Agentic AI“ (PDF)", href: proofSource("Lufthansa").href, external: true },
    visual: "answer",
    transfer: "Bei Störungen die Ursache eingrenzen, Handbücher und Wissensdatenbank durchsuchen und die Lösung vorschlagen, mit Quelle.",
  },
];

/**
 * Die Fälle mit der aktuellen Zahl freigegebener Profile. Ohne Zahl (keine
 * Datenbank) steht dort „alle“, und die Kennzahl fällt weg.
 */
export function praxisCases(profiles: number | null): readonly PraxisCase[] {
  return CASES.map((item) => {
    if (item.interest !== "anfragen") return item;
    return {
      ...item,
      headline: item.headline.replace("{profiles}", profiles ? `${profiles} geprüfte Profile` : "alle geprüften Profile"),
      stats: profiles
        ? item.stats?.map((stat) => (stat.value === "{count}" ? { ...stat, value: String(profiles) } : stat))
        : item.stats?.filter((stat) => stat.value !== "{count}"),
    };
  });
}
