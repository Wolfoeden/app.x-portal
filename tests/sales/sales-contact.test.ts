import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

import { ContactPerson } from "@/components/marketing/ContactPerson";
import { salesContactPhotoUrl } from "@/lib/sales/sales-contact";
import { SALES_CONTACT, contactInitials } from "@/lib/sales/sales-contact-model";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const PATH = `${SALES_CONTACT.profileId}/avatar-0123456789abcdef0123456789abcdef.webp`;

function adminReturning(result: { data: unknown; error: unknown } | Error) {
  const eq = vi.fn(() => ({
    maybeSingle: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
  }));
  const select = vi.fn(() => ({ eq }));
  vi.mocked(createAdminSupabaseClient).mockReturnValue({ from: vi.fn(() => ({ select })) } as never);
  return { select, eq };
}

beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(createAdminSupabaseClient).mockReset();
});

describe("salesContactPhotoUrl", () => {
  it("serves the photo of the contact's own profile through the avatar route", async () => {
    const { select, eq } = adminReturning({ data: { avatar_path: PATH }, error: null });
    await expect(salesContactPhotoUrl()).resolves.toBe(`/api/freelancer/avatar-image/${PATH}`);
    expect(select).toHaveBeenCalledWith("avatar_path");
    expect(eq).toHaveBeenCalledWith("id", SALES_CONTACT.profileId);
  });

  it("returns null without a database, without a photo or on errors", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(salesContactPhotoUrl()).resolves.toBeNull();
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();

    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    adminReturning({ data: { avatar_path: null }, error: null });
    await expect(salesContactPhotoUrl()).resolves.toBeNull();
    adminReturning({ data: null, error: null });
    await expect(salesContactPhotoUrl()).resolves.toBeNull();
    adminReturning({ data: null, error: { message: "boom" } });
    await expect(salesContactPhotoUrl()).resolves.toBeNull();
    adminReturning(new Error("network"));
    await expect(salesContactPhotoUrl()).resolves.toBeNull();
  });

  it("ignores a stored value that is not an avatar path", async () => {
    adminReturning({ data: { avatar_path: "../../etc/passwd" }, error: null });
    await expect(salesContactPhotoUrl()).resolves.toBeNull();
  });
});

describe("ContactPerson", () => {
  it("shows name, role and initials without a photo", () => {
    const markup = renderToStaticMarkup(createElement(ContactPerson));
    expect(contactInitials(SALES_CONTACT.name)).toBe("RD");
    expect(markup).toContain(SALES_CONTACT.name);
    expect(markup).toContain(SALES_CONTACT.role);
    expect(markup).toContain(">RD</span>");
    expect(markup).not.toContain("background-image");
  });

  it("lays the photo over the initials when there is one", () => {
    const url = `/api/freelancer/avatar-image/${PATH}`;
    const markup = renderToStaticMarkup(createElement(ContactPerson, { photoUrl: url }));
    expect(markup).toContain(`background-image:url(&quot;${url}&quot;)`);
    expect(markup).toContain('role="img"');
    // Die Initialen bleiben darunter, falls das Bild nicht lädt.
    expect(markup).toContain(">RD</span>");
  });
});
