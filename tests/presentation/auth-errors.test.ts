import { describe, expect, it } from "vitest";

import { authErrorMessage, isServiceSideAuthFailure } from "@/components/chat/auth-errors";

/** Nachbau dessen, was supabase-js an einem Fehler mitliefert. */
function authError(fields: { status?: number; code?: string; message?: string }) {
  const error = new Error(fields.message ?? "Auth error") as Error & {
    status?: number;
    code?: string;
  };
  if (fields.status !== undefined) error.status = fields.status;
  if (fields.code !== undefined) error.code = fields.code;
  return error;
}

describe("auth error messages", () => {
  // Der Anlass fuer dieses Modul: der Mailversand nahm die SMTP-Zugangsdaten
  // nicht mehr an, /signup antwortete mit 500 — und die Oberflaeche schickte
  // den Nutzer los, seine korrekte E-Mail und sein korrektes Passwort zu
  // pruefen.
  it("does not blame the input when the service itself failed", () => {
    const message = authErrorMessage(
      authError({ status: 500, code: "unexpected_failure", message: "Error sending confirmation email" }),
      "register",
    );

    expect(message).not.toContain("Prüfen Sie E-Mail und Passwort");
    expect(message).toContain("nicht an Ihrem Passwort");
  });

  /**
   * Supabase meldet jeden gescheiterten Versand als `unexpected_failure`, egal
   * woran er lag. Am 01.09.2026 war es `550 mailbox unavailable — invalid DNS
   * MX or A/AAAA resource record`: Die Empfaengerdomain gab es nicht. Eine
   * Meldung, die nur vom eigenen Dienst spricht, schickt so jemanden weg,
   * dessen Adresse keine Post annimmt.
   */
  it("names the unreachable address as the other possible cause", () => {
    const message = authErrorMessage(
      authError({ status: 500, code: "unexpected_failure", message: "Error sending confirmation email" }),
      "register",
    );

    expect(message).toContain("Adresse");
    expect(message).toContain("Schreibweise");
  });

  it("recognises a service-side failure by status, code or message", () => {
    expect(isServiceSideAuthFailure(authError({ status: 502 }))).toBe(true);
    expect(isServiceSideAuthFailure(authError({ code: "unexpected_failure" }))).toBe(true);
    expect(isServiceSideAuthFailure(authError({ code: "over_email_send_rate_limit" }))).toBe(true);
    expect(isServiceSideAuthFailure(authError({ message: "Error sending confirmation mail" }))).toBe(true);
  });

  it("leaves a genuine input error attributed to the input", () => {
    expect(isServiceSideAuthFailure(authError({ status: 400, code: "invalid_credentials" }))).toBe(false);
    expect(authErrorMessage(authError({ status: 400, code: "invalid_credentials" }), "login")).toContain(
      "nicht korrekt",
    );
  });

  it("points an existing address at the sign-in tab instead of the password", () => {
    const message = authErrorMessage(
      authError({ status: 422, code: "user_already_exists", message: "User already registered" }),
      "register",
    );

    expect(message).toContain("bereits ein Konto");
    expect(message).toContain("Bestehendes Konto");
  });

  it("names a weak password as such", () => {
    const message = authErrorMessage(
      authError({ status: 422, code: "weak_password", message: "Password should be at least 8 characters" }),
      "register",
    );

    expect(message).toContain("Passwort");
    expect(message).toContain("länger");
  });

  it("keeps a mode-specific fallback when nothing more precise is known", () => {
    expect(authErrorMessage(new Error("boom"), "recover")).toContain("Wiederherstellungslink");
    expect(authErrorMessage(new Error("boom"), "set-password")).toContain("neue Passwort");
    expect(authErrorMessage(new Error("boom"), "register")).toContain("Prüfen Sie E-Mail und Passwort");
  });

  it("survives a thrown value that is not an Error", () => {
    expect(() => authErrorMessage("kaputt", "register")).not.toThrow();
    expect(() => authErrorMessage(null, "login")).not.toThrow();
    expect(isServiceSideAuthFailure(null)).toBe(false);
  });
});
