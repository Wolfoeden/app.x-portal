/** Only the new no_fee workflow uses these templates. Legacy terms stay intact. */
export function freelancerContactRequest(input: {
  projectTitle: string | null;
  freelancerName: string;
  consentUrl: string;
}) {
  return {
    subject: `Kontaktanfrage über XPORTAL: ${input.projectTitle || "Freelancer-Projekt"}`,
    text: [
      `Guten Tag ${input.freelancerName},`,
      "",
      `ein Nutzer hat für „${input.projectTitle || "ein Freelancer-Projekt"}“ gezielt eine Kontaktanfrage ausgelöst.`,
      "Sie entscheiden selbst, ob Sie Kontakt wünschen. Erst nach Ihrer Freigabe teilen wir die Kontaktadressen zwischen Ihnen und dem Anfragenden.",
      "Ein Profilfund bestätigt weder Ihr Interesse noch Ihre Verfügbarkeit. Klären Sie Einsatzzeitraum und Projektbedingungen direkt.",
      "",
      "Anfrage prüfen und annehmen oder ablehnen (Link 7 Tage gültig):",
      input.consentUrl,
      "",
      "Für diesen neuen Vorgang fällt keine Vermittlungsprovision oder Erfolgsgebühr an.",
      "XPORTAL",
    ].join("\n"),
  };
}

export function contactAcceptedMessage(input: { projectTitle: string | null; counterpartEmail: string; counterpartName: string; bookingUrl?: string | null }) {
  return {
    subject: `Kontakt freigegeben: ${input.projectTitle || "Freelancer-Projekt"}`,
    text: [
      "Die angefragte Kontaktfreigabe wurde bestätigt.",
      `${input.counterpartName}: ${input.counterpartEmail}`,
      ...(input.bookingUrl ? [`Freigegebener Kalender: ${input.bookingUrl}`] : []),
      "Bitte klären Sie aktuelle Verfügbarkeit, Einsatzbedingungen und eine mögliche Beauftragung direkt. Kontaktfreigabe bedeutet noch keine bestätigte Einsatzbereitschaft.",
      "Für diesen neuen Vorgang fällt keine Vermittlungsprovision oder Erfolgsgebühr an.",
      "XPORTAL",
    ].join("\n"),
  };
}
