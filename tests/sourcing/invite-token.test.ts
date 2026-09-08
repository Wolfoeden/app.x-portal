import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  inviteTrackingConfigured,
  mintInviteToken,
  readInviteToken,
} from "@/lib/sourcing/invite-token";
import {
  mintUnsubscribeToken,
  readUnsubscribeToken,
} from "@/lib/email/unsubscribe";

const GEHEIMNIS = "x".repeat(48);
const ID = "3b85b09e-ea85-48dc-9eac-10f03bc39199";

describe("invite-token", () => {
  const vorher = process.env.EMAIL_UNSUBSCRIBE_SECRET;

  beforeEach(() => {
    process.env.EMAIL_UNSUBSCRIBE_SECRET = GEHEIMNIS;
  });

  afterEach(() => {
    if (vorher === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    else process.env.EMAIL_UNSUBSCRIBE_SECRET = vorher;
  });

  it("liest zurück, was es erzeugt hat", () => {
    const token = mintInviteToken(ID);
    expect(token).not.toBeNull();
    expect(readInviteToken(token)).toBe(ID);
  });

  it("weist ein verändertes Kennzeichen ab", () => {
    const token = mintInviteToken(ID)!;
    expect(readInviteToken(`${token}x`)).toBeNull();
    expect(readInviteToken(token.replace(ID, ID.replace("3b85", "3b86")))).toBeNull();
  });

  it("weist alles ab, was keine Kennung ist", () => {
    expect(readInviteToken("kein-token")).toBeNull();
    expect(readInviteToken("")).toBeNull();
    expect(readInviteToken(null)).toBeNull();
    expect(readInviteToken(42)).toBeNull();
    expect(readInviteToken(`nicht-uuid.${"a".repeat(43)}`)).toBeNull();
  });

  it("erzeugt nichts zu einer Kennung, die keine ist", () => {
    expect(mintInviteToken("irgendwas")).toBeNull();
  });

  it("trennt sich vom Abmeldelink", () => {
    // Beide benutzen dasselbe Geheimnis. Ohne die Zwecktrennung im HMAC wäre
    // ein gültiger Abmeldetoken zugleich ein gültiges Einladungskennzeichen.
    const abmeldung = mintUnsubscribeToken("jemand@example.de")!;
    expect(readInviteToken(abmeldung)).toBeNull();

    const einladung = mintInviteToken(ID)!;
    expect(readUnsubscribeToken(einladung)).toBeNull();
  });

  it("erzeugt ohne Geheimnis nichts und liest nichts", () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    expect(inviteTrackingConfigured()).toBe(false);
    expect(mintInviteToken(ID)).toBeNull();
    expect(readInviteToken(`${ID}.egal`)).toBeNull();
  });

  it("erzeugt ohne ausreichend langes Geheimnis nichts", () => {
    // Ein kurzes Geheimnis sähe eingerichtet aus und wäre zu erraten.
    process.env.EMAIL_UNSUBSCRIBE_SECRET = "kurz";
    expect(inviteTrackingConfigured()).toBe(false);
    expect(mintInviteToken(ID)).toBeNull();
  });

  it("erkennt die Kennung unabhängig von der Schreibweise zurück", () => {
    const token = mintInviteToken(ID.toLowerCase())!;
    expect(readInviteToken(token)).toBe(ID.toLowerCase());
  });
});
