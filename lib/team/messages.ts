import { IMPRINT_EMAIL } from "@/lib/legal/policy";

/**
 * Die Einladung an ein neues Teammitglied.
 *
 * Bisher wurde jemand einem Plan hinzugefuegt und erfuhr es nie: Der Zugang
 * war da, die Person wusste nichts davon. Wer nichts weiss, nutzt nichts —
 * und wer unerwartet fremdes Guthaben verbraucht, ebenso wenig.
 *
 * Hinzugefuegt werden koennen nur Adressen, die bereits ein Konto haben; die
 * Route weist alles andere mit `not_registered` ab. Die Nachricht geht also an
 * jemanden, der XPORTAL kennt, und muss kein Konto erklaeren.
 */
export function teamInvitationMessage(input: {
  ownerEmail: string | null;
}): { subject: string; text: string } {
  const wer = input.ownerEmail ?? "Der Inhaber eines XPORTAL-Plans";

  return {
    subject: "Sie wurden zu einem XPORTAL-Team hinzugefügt",
    text: [
      "Guten Tag,",
      "",
      `${wer} hat Sie zu seinem Team bei XPORTAL hinzugefügt.`,
      "",
      "Was das bedeutet: Sie greifen mit Ihrem bestehenden Konto auf das",
      "Guthaben dieses Plans zu. Was Sie verbrauchen, wird davon abgezogen —",
      "das Team teilt sich ein gemeinsames Kontingent.",
      "",
      "Sie müssen nichts bestätigen und nichts einrichten. Melden Sie sich wie",
      "gewohnt an: https://x-portal.eu/chat",
      "",
      "Wenn Sie damit nicht einverstanden sind, wenden Sie sich an die Person,",
      `die Sie hinzugefügt hat, oder schreiben Sie uns an ${IMPRINT_EMAIL}.`,
      "",
      "300 – Inhaber Roman Dering, Heilig-Kreuz-Straße 18, 87600 Kaufbeuren",
      `${IMPRINT_EMAIL} · https://x-portal.eu/imprint`,
    ].join("\n"),
  };
}
