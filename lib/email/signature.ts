/**
 * Wer unsere Mails unterschreibt, und als was.
 *
 * Oktober 2026: als Produktmanager. Die Anbieterkennzeichnung im Fuß
 * („XPORTAL — Roman Dering, Einzelunternehmen“, lib/legal/policy.ts) bleibt
 * davon unberührt; sie nennt, wer rechtlich hinter der Mail steht.
 */
export const SIGNER_NAME = "Roman Dering";
export const SIGNER_TITLE = "Produktmanager";

/** Name und Funktion unter dem Gruß. */
export const SIGNER_LINES = [SIGNER_NAME, `${SIGNER_TITLE} · XPORTAL`] as const;

/** Gruß, Name und Funktion: das Ende jeder Mail von XPORTAL. */
export const SIGNATURE_LINES = ["Viele Grüße", ...SIGNER_LINES] as const;
