import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminSurface } from "@/components/admin/AdminDataPrimitives";
import { PublicDocumentIntro } from "@/components/public/PublicChrome";

type IntroProps = Omit<Parameters<typeof PublicDocumentIntro>[0], "children">;
type SurfaceProps = Omit<Parameters<typeof AdminSurface>[0], "children">;
const RenderableDocumentIntro = PublicDocumentIntro as ComponentType<PropsWithChildren<IntroProps>>;
const RenderableAdminSurface = AdminSurface as ComponentType<PropsWithChildren<SurfaceProps>>;

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Paket 3: Sekundärflächen und interne Werkzeuge", () => {
  it("verwendet einen informativen Kontextstempel statt route-eigener Hero-Varianten", () => {
    const markup = renderToStaticMarkup(
      createElement(
        RenderableDocumentIntro,
        {
          eyebrow: "Sicherer Übergang",
          title: "Sie bleiben in XPORTAL.",
          signal: { label: "Status", value: "Geprüft" },
        },
        createElement("p", null, "Der nächste Schritt bleibt sichtbar."),
      ),
    );

    expect(markup).toContain("Sicherer Übergang");
    expect(markup).toContain("<h1>Sie bleiben in XPORTAL.</h1>");
    expect(markup).toContain('aria-label="Status: Geprüft"');
    expect(markup).toContain("Der nächste Schritt bleibt sichtbar.");
  });

  it("führt Kontakt, Recht, Fehler und Buchung durch denselben Seitenkopf", () => {
    for (const path of [
      "app/contact/page.tsx",
      "app/imprint/page.tsx",
      "app/privacy/page.tsx",
      "app/terms/page.tsx",
      "app/error.tsx",
      "app/not-found.tsx",
      "app/booking/[id]/page.tsx",
    ]) {
      const file = source(path);
      expect(file, path).toContain("PublicDocumentIntro");
      expect(file, path).toContain("PublicHeader");
      expect(file, path).toContain("PublicFooter");
    }
  });

  it("bewahrt beim Auth-Abschluss Bereinigung und Sitzungsaufbau im gemeinsamen Rahmen", () => {
    const file = source("app/auth/complete/page.tsx");
    const sanitize = file.indexOf("window.history.replaceState");
    const complete = file.indexOf("completeEmailAuthSession(completion)");

    expect(file).toContain("PublicDocumentIntro");
    expect(file).toContain("PublicHeader");
    expect(file).toContain("PublicFooter");
    expect(sanitize).toBeGreaterThan(0);
    expect(complete).toBeGreaterThan(sanitize);
  });

  it("gibt jeder Admin-Seite denselben Arbeitsrahmen", () => {
    const markup = renderToStaticMarkup(
      createElement(RenderableAdminSurface, { label: "Administration · Test" }, "Inhalt"),
    );
    expect(markup).toContain('aria-label="Administration · Test"');

    for (const path of [
      "app/chat/admin/users/page.tsx",
      "app/chat/admin/demand/page.tsx",
      "app/chat/admin/leads/page.tsx",
      "app/chat/admin/freelancers/page.tsx",
      "app/chat/admin/freelancers/[id]/page.tsx",
      "app/chat/admin/ai-usage/page.tsx",
      "components/admin/AdminPagesPreview.tsx",
    ]) {
      expect(source(path), path).toContain("AdminSurface");
    }
  });

  it("entfernt Agent Grid einschließlich Route, API, Domaincode und Abhängigkeit", () => {
    for (const path of [
      "app/chat/agent-grid/page.tsx",
      "app/chat/agent-grid/AgentGridWorkspace.tsx",
      "app/chat/agent-grid/AgentGridCanvas.tsx",
      "app/chat/agent-grid/agent-grid.module.css",
      "app/chat/preview/agent-grid/page.tsx",
      "app/api/agent-grid/analyze/route.ts",
      "lib/agent-grid/ai.ts",
      "lib/agent-grid/blueprint.ts",
      "lib/agent-grid/bpmn.ts",
      "lib/agent-grid/economics.ts",
      "lib/agent-grid/scenarios.ts",
      "lib/agent-grid/workshop.ts",
      "tests/agent-grid/ai.test.ts",
      "tests/agent-grid/blueprint.test.ts",
      "tests/agent-grid/bpmn.test.ts",
      "tests/agent-grid/economics.test.ts",
      "tests/agent-grid/route.test.ts",
      "tests/agent-grid/workshop.test.ts",
    ]) {
      expect(existsSync(new URL(`../../${path}`, import.meta.url)), path).toBe(false);
    }

    expect(source("app/chat/admin/AdminNav.tsx")).not.toContain("Agent Grid");
    expect(JSON.parse(source("package.json")).dependencies).not.toHaveProperty("bpmn-js");
  });
});
