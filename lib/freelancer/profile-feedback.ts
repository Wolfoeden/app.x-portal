/**
 * „Passt nicht" mit Grund.
 *
 * Ein Daumen allein hätte bei heutigem Verkehr kaum Daten geliefert und dem
 * Nutzer nichts gebracht. Der Grund macht die Rückmeldung wirksam: Er blendet
 * das Profil in dieser Suche aus und führt zu dem Kriterium, das die Suche
 * schärft — sichtbar, im Kriterien-Editor, nicht als verdeckte Umsortierung.
 * Bleibt nichts übrig, ist der nächste Schritt die öffentliche Recherche.
 *
 * Für den Betreiber zählt die Summe je Profil: „zu teuer" oder „nicht
 * verfügbar" heißt, das Profil zu aktualisieren; „Skill fehlt" oder „Rolle"
 * zeigt, wofür Freelancer fehlen.
 */

export const PROFILE_FEEDBACK_REASONS = [
  "role",
  "skill",
  "price",
  "availability",
  "location",
  "other",
] as const;

export type ProfileFeedbackReason = (typeof PROFILE_FEEDBACK_REASONS)[number];

export function isProfileFeedbackReason(value: unknown): value is ProfileFeedbackReason {
  return (
    typeof value === "string" &&
    (PROFILE_FEEDBACK_REASONS as readonly string[]).includes(value)
  );
}

export const PROFILE_FEEDBACK_LABELS: Readonly<Record<ProfileFeedbackReason, string>> = {
  role: "Andere Rolle",
  skill: "Wichtiger Skill fehlt",
  price: "Zu teuer",
  availability: "Nicht verfügbar",
  location: "Remote oder Ort passt nicht",
  other: "Anderer Grund",
};

/**
 * Das Feld im Kriterien-Editor, das zu einem Grund gehört, und der Satz, der
 * sagt, was eine Angabe dort bewirkt. `null` heißt: nur ausblenden.
 *
 * Die Feldnamen sind die des Editors (`components/chat/brief-editor.ts`). Sie
 * stehen hier als Zeichenketten, damit dieses Modul ohne die Oberfläche
 * auskommt; ein Test hält beide Seiten zusammen.
 */
export const PROFILE_FEEDBACK_REFINEMENT: Readonly<
  Record<ProfileFeedbackReason, { field: string; hint: string } | null>
> = {
  role: {
    field: "projectTitle",
    hint: "Nennen Sie die gesuchte Rolle im Projekttitel, zum Beispiel „SAP Engineer“. Profile mit einer anderen Rolle werden dann nicht mehr empfohlen.",
  },
  skill: {
    field: "hardRequirements",
    hint: "Tragen Sie den fehlenden Skill als Muss ein. Profile ohne Beleg dafür werden dann nicht mehr empfohlen.",
  },
  price: {
    field: "budgetOrRate",
    hint: "Nennen Sie Ihr Budget, zum Beispiel „bis 800 €/Tag“. Teurere Profile fallen dann heraus.",
  },
  availability: {
    field: "startWindow",
    hint: "Nennen Sie den gewünschten Start. Die Auswahl berücksichtigt ihn beim nächsten Abgleich.",
  },
  location: {
    field: "mode",
    hint: "Legen Sie den Arbeitsmodus fest. Profile, die nicht dazu passen, fallen heraus.",
  },
  other: null,
};

/** Die Protokolleinträge, aus denen die Admin-Ansicht zählt. */
export const PROFILE_FEEDBACK_ACTIONS = {
  unsuitable: "profile_feedback_unsuitable",
  withdrawn: "profile_feedback_withdrawn",
} as const;

export type DismissedProfile = {
  profileId: string;
  reason: ProfileFeedbackReason;
};

/**
 * Die ausgeblendeten Profile je Projekt, im Browser. Bewusst lokal: Es ist
 * eine Ansicht des Nutzers auf seine eigene Suche, keine Aussage über das
 * Profil. Die Aussage über das Profil geht getrennt an den Server.
 */
export const DISMISSED_PROFILES_STORAGE_KEY = "xportal.dismissed-profiles.v1";

export function readDismissedProfiles(
  raw: string | null,
): Record<string, DismissedProfile[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, DismissedProfile[]> = {};
    for (const [projectId, entries] of Object.entries(parsed)) {
      if (!Array.isArray(entries)) continue;
      const valid = entries.filter(
        (entry): entry is DismissedProfile =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as DismissedProfile).profileId === "string" &&
          isProfileFeedbackReason((entry as DismissedProfile).reason),
      );
      if (valid.length) result[projectId] = valid.slice(0, 50);
    }
    return result;
  } catch {
    return {};
  }
}

export type ProfileFeedbackCount = { reason: ProfileFeedbackReason; count: number };

/**
 * Zählt die Rückmeldungen je Grund. Ein Zurücknehmen hebt einen Eintrag
 * desselben Grundes auf; was danach übrig bleibt, gilt.
 */
export function summarizeProfileFeedback(
  rows: ReadonlyArray<{ action: string; reason: unknown }>,
): ProfileFeedbackCount[] {
  const counts = new Map<ProfileFeedbackReason, number>();
  for (const row of rows) {
    if (!isProfileFeedbackReason(row.reason)) continue;
    const delta =
      row.action === PROFILE_FEEDBACK_ACTIONS.unsuitable
        ? 1
        : row.action === PROFILE_FEEDBACK_ACTIONS.withdrawn
          ? -1
          : 0;
    counts.set(row.reason, (counts.get(row.reason) ?? 0) + delta);
  }
  return PROFILE_FEEDBACK_REASONS.flatMap((reason) => {
    const count = counts.get(reason) ?? 0;
    return count > 0 ? [{ reason, count }] : [];
  });
}
