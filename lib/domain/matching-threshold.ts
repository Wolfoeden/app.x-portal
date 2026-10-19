/** Shared display threshold without the matching engine or schema dependencies. */
export const MINIMUM_CORE_COVERAGE_BASIS_POINTS = 7_000 as const;

/**
 * Ab dieser Einschätzung deckt ein Profil laut KI das Wesentliche der Anfrage
 * ab (Stufe „70–89“ der Bewertung, lib/openai/profile-ranking.ts). Liegt selbst
 * das beste Profil darunter, passt intern nichts richtig: Dann bietet der Chat
 * die externe Recherche an, und die Admin-Auswertung zählt die Suche als
 * Kataloglücke (lib/domain/ai-shortlist.ts).
 */
export const AI_FIT_THRESHOLD = 70 as const;
