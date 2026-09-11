import { DEMO_CURRENT_BLUEPRINT, DEMO_TARGET_BLUEPRINT, DEMO_DISCOVERY_CARDS, ProcessBlueprintSchema, type ProcessBlueprint } from "./blueprint";
import { emptyWorkshop, type Workshop } from "./workshop";

function serviceBlueprint(target: boolean, invoice: boolean): ProcessBlueprint {
  const name = invoice ? "Rechnungsprüfung" : "Kundenservice";
  return ProcessBlueprintSchema.parse({
    processName: name,
    mission: invoice ? "Eingangsrechnungen vorbereiten, Abweichungen erkennen und jede Zahlung beim verantwortlichen Menschen belassen." : "Kundenanfragen verstehen, Antworten vorbereiten und sensible Fälle an Ihr Team übergeben.",
    nodes: [
      { id: "received", type: "start", label: invoice ? "Rechnung eingegangen" : "Anfrage eingegangen", confidence: "confirmed" },
      { id: "understand", type: target ? "ai_task" : "human_task", label: invoice ? "Rechnungsdaten auslesen" : "Anliegen verstehen", description: invoice ? "Belegpositionen, Beträge und Lieferant strukturiert erfassen." : "Thema, Dringlichkeit und Kundenwunsch aus der Nachricht ermitteln.", system: "Outlook", confidence: target ? "assumed" : "confirmed" },
      { id: "lookup", type: target ? "service_task" : "human_task", label: invoice ? "Bestellung abgleichen" : "Kundendaten abrufen", description: "Passende Datensätze anhand eindeutiger Merkmale zuordnen. Zugriff und Berechtigungen sind vorab zu prüfen.", system: invoice ? "ERP" : "CRM", confidence: "assumed" },
      { id: "decision", type: "gateway", label: invoice ? "Daten stimmen überein?" : "Standardfall?", confidence: "assumed" },
      { id: "prepare", type: target ? "ai_task" : "human_task", label: invoice ? "Buchung vorschlagen" : "Antwort vorbereiten", description: invoice ? "Kontierung als Vorschlag vorbereiten. Zahlungsfreigaben bleiben außerhalb der Agentenbefugnisse." : "Eine Antwort auf Basis freigegebener Informationen formulieren. Keine erfundenen Zusagen oder Konditionen.", confidence: "assumed" },
      { id: "approval", type: "approval", label: invoice ? "Abweichung prüfen" : "Sonderfall prüfen", description: "Bei fehlenden Informationen oder einer Ausnahme übernimmt ein verantwortlicher Mensch.", confidence: "confirmed" },
      { id: "result", type: "end", label: invoice ? "Bereit zur Freigabe" : "Bereit zur Bearbeitung", confidence: "assumed" },
    ],
    edges: [ { from: "received", to: "understand" }, { from: "understand", to: "lookup" }, { from: "lookup", to: "decision" },
      { from: "decision", to: "prepare", label: "Ja" }, { from: "decision", to: "approval", label: "Nein / unklar" },
      { from: "prepare", to: "result" }, { from: "approval", to: "result" } ],
    systems: ["Outlook", invoice ? "ERP" : "CRM"], dataSources: invoice ? ["Eingangsrechnung", "Bestellung", "Lieferantenstamm"] : ["Kundenanfrage", "Kundenstammdaten", "Freigegebene Wissensbasis"],
    painPoints: ["Manuelle Übernahme und Prüfung jeder eingehenden Nachricht.", "Wiederkehrende Fälle binden Fachkräfte."],
    assumptions: ["Lesender Zugriff auf die genannten Systeme ist technisch möglich.", "Regeln für Standardfälle werden mit dem Fachbereich vereinbart."],
    missingInformation: ["Welche konkrete Software und Schnittstelle nutzen Sie?", "Welche Fälle muss immer ein Mensch prüfen?", "Woran messen wir die Qualität im Pilotbetrieb?"],
    automationOpportunities: [],
  });
}

export const SCENARIOS = [
  { id: "service", label: "Kundenservice", description: "Von der E-Mail zum Antwortentwurf" },
  { id: "invoice", label: "Rechnungsprüfung", description: "Belege prüfen, Abweichungen übergeben" },
  { id: "property", label: "Mieter-Service", description: "Anfragen, Tickets und Sonderfälle" },
] as const;

export function scenarioWorkshop(id: string): Workshop {
  const property = id === "property";
  const invoice = id === "invoice";
  const current = property ? DEMO_CURRENT_BLUEPRINT : serviceBlueprint(false, invoice);
  const target = property ? DEMO_TARGET_BLUEPRINT : serviceBlueprint(true, invoice);
  return { ...emptyWorkshop(), example: true,
    useCase: property ? "Mieter-Service" : invoice ? "Rechnungsprüfung" : "Kundenservice",
    company: "Beispielunternehmen", current, target,
    cards: property ? DEMO_DISCOVERY_CARDS : [
      { id: "system-mail", type: "system", title: "Outlook" },
      { id: "system-data", type: "system", title: invoice ? "ERP" : "CRM" },
      { id: "exception", type: "human_approval", title: "Sensible oder unklare Fälle bleiben beim Menschen" },
    ],
    scope: "Ein Postfach, ein klar abgegrenzter Prozess und eine Systemanbindung. Zunächst Entwürfe zur Prüfung erstellen.",
    acceptance: "Gemeinsam ausgewählte Standard- und Ausnahmefälle testen. Ergebnisqualität, Übergabe an Menschen und Protokollierung gemeinsam abnehmen.",
  };
}
