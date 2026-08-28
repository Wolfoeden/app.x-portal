import { describe, expect, it } from "vitest";

import {
  AVATAR_IMAGE_ROUTE,
  avatarImageUrl,
  avatarObjectPathFrom,
  normalizeAvatarUrl,
} from "@/lib/freelancer/avatar-limits";

const PROFILE = "11111111-2222-4333-8444-555555555555";
const OBJECT = `${PROFILE}/avatar-${"a".repeat(32)}.jpg`;
const LEGACY = `https://xmoxzfqmcnsntvqxhtfb.supabase.co/storage/v1/object/public/freelancer-avatars/${OBJECT}`;

describe("avatar addressing", () => {
  it("points at the application, not at storage", () => {
    // Der öffentliche Bucket war der Befund: eine Adresse, die jeder abrufen
    // konnte, unabhängig vom Profilstatus.
    expect(avatarImageUrl(OBJECT)).toBe(`${AVATAR_IMAGE_ROUTE}/${OBJECT}`);
    expect(avatarImageUrl(OBJECT)).not.toContain("supabase.co");
    expect(avatarImageUrl(OBJECT)).not.toContain("/public/");
  });

  it("refuses a path that does not match the minted shape", () => {
    expect(avatarImageUrl(null)).toBeNull();
    expect(avatarImageUrl("../../etc/passwd")).toBeNull();
    expect(avatarImageUrl(`${PROFILE}/avatar-kurz.jpg`)).toBeNull();
    expect(avatarImageUrl(`${PROFILE}/avatar-${"a".repeat(32)}.svg`)).toBeNull();
  });

  it("recovers the object path from a stored legacy URL", () => {
    // Ältere Match-Snapshots tragen noch die alte Storage-Adresse; sie wird
    // beim Lesen umgeschrieben, nicht in der Datenbank angefasst.
    expect(avatarObjectPathFrom(LEGACY)).toBe(OBJECT);
    expect(normalizeAvatarUrl(LEGACY)).toBe(`${AVATAR_IMAGE_ROUTE}/${OBJECT}`);
  });

  it("leaves an already normalised address unchanged", () => {
    const routed = `${AVATAR_IMAGE_ROUTE}/${OBJECT}`;

    expect(normalizeAvatarUrl(routed)).toBe(routed);
  });

  it("drops an address that belongs to something else", () => {
    expect(normalizeAvatarUrl("https://attacker.example/avatar.jpg")).toBeNull();
    expect(
      normalizeAvatarUrl(
        "https://ref.supabase.co/storage/v1/object/public/freelancer-cvs/x.pdf",
      ),
    ).toBeNull();
    expect(normalizeAvatarUrl(null)).toBeNull();
    expect(normalizeAvatarUrl("")).toBeNull();
  });

  it("survives a round trip through the route form", () => {
    const routed = avatarImageUrl(OBJECT);

    expect(avatarObjectPathFrom(routed)).toBe(OBJECT);
  });
});
