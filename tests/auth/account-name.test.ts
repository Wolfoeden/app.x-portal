import { describe, expect, it } from "vitest";

import {
  ACCOUNT_NAME_MAX_LENGTH,
  accountNameFromMetadata,
  shownAccountName,
} from "@/lib/auth/account-name";

describe("shown account name", () => {
  it("uses the stored name when there is one", () => {
    expect(shownAccountName("Erika Mustermann", "erika@example.com")).toBe("Erika Mustermann");
  });

  it("falls back to the part of the e-mail address before the @", () => {
    expect(shownAccountName(null, "erika.mustermann@example.com")).toBe("erika.mustermann");
  });

  it("has nothing to show without a name or address", () => {
    expect(shownAccountName(null, null)).toBeNull();
    expect(shownAccountName(null, "@example.com")).toBeNull();
  });
});

describe("account name from user metadata", () => {
  it("prefers the name the account holder entered over the sign-in provider's", () => {
    expect(
      accountNameFromMetadata({ display_name: "Erika", full_name: "Erika Mustermann" }),
    ).toBe("Erika");
  });

  it("falls back to the provider's full name, then to its name", () => {
    expect(accountNameFromMetadata({ display_name: null, full_name: " Erika Mustermann " })).toBe(
      "Erika Mustermann",
    );
    expect(accountNameFromMetadata({ full_name: "", name: "Erika Mustermann" })).toBe(
      "Erika Mustermann",
    );
  });

  it("caps a name that was written directly through the auth API", () => {
    expect(accountNameFromMetadata({ display_name: "E".repeat(500) })).toHaveLength(
      ACCOUNT_NAME_MAX_LENGTH,
    );
  });

  it.each([undefined, null, "Erika", {}, { email_verified: true }, { display_name: 42 }])(
    "has no name for %j",
    (metadata) => {
      expect(accountNameFromMetadata(metadata)).toBeNull();
    },
  );
});
