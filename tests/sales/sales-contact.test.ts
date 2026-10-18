import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContactPerson } from "@/components/marketing/ContactPerson";
import { SALES_CONTACT, contactInitials } from "@/lib/sales/sales-contact-model";

// Seit 18.10.2026 liegt das Foto als Datei in public/images; vorher kam es
// über die Profilbild-Route (Server-Funktion + signierte Weiterleitung,
// im Median 5 Sekunden).
describe("contact photo", () => {
  it("is a static file in both sizes", () => {
    for (const src of [SALES_CONTACT.photo.small, SALES_CONTACT.photo.large]) {
      expect(src).toMatch(/^\/images\/[a-z0-9-]+\.webp$/u);
      expect(existsSync(new URL(`../../public${src}`, import.meta.url))).toBe(true);
    }
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
    const url = SALES_CONTACT.photo.small;
    const markup = renderToStaticMarkup(createElement(ContactPerson, { photoUrl: url }));
    expect(markup).toContain(`background-image:url(&quot;${url}&quot;)`);
    expect(markup).toContain('role="img"');
    // Die Initialen bleiben darunter, falls das Bild nicht lädt.
    expect(markup).toContain(">RD</span>");
  });
});
