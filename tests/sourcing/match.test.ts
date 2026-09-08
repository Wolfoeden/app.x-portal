import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { skillOverlap } from "@/lib/sourcing/match";

describe("skillOverlap", () => {
  it("trennt Gefragtes mit Beleg von Gefragtem ohne", () => {
    const { matching, other } = skillOverlap(
      ["PostgreSQL", "Airflow", "Kubernetes"],
      ["PostgreSQL", "Oracle", "Airflow"],
    );
    expect(matching).toEqual(["PostgreSQL", "Airflow"]);
    expect(other).toEqual(["Kubernetes"]);
  });

  it("erkennt dieselbe Erfahrung in anderer Schreibweise", () => {
    // Die Schreibweisen stammen aus echten freelancermap-Profilen.
    expect(skillOverlap(["React"], ["React.js"]).matching).toEqual(["React"]);
    expect(skillOverlap(["Angular"], ["Angular 2+"]).matching).toEqual(["Angular"]);
    expect(skillOverlap(["Node"], ["Node.js"]).matching).toEqual(["Node"]);
    expect(skillOverlap(["Oracle"], ["Oracle 10g/11g"]).matching).toEqual(["Oracle"]);
  });

  it("hält eine nackte Zahl für einen Produktnamen, nicht für eine Version", () => {
    // „Microsoft 365" ist keine Version von „Microsoft".
    expect(skillOverlap(["Microsoft"], ["Microsoft 365"]).matching).toEqual([]);
    expect(skillOverlap(["Windows"], ["Windows 11"]).matching).toEqual([]);
    expect(skillOverlap(["Microsoft 365"], ["Microsoft 365"]).matching).toEqual([
      "Microsoft 365",
    ]);
  });

  it("beschriftet mit der Schreibweise des Bedarfs, nicht des Profils", () => {
    const { matching } = skillOverlap(["TypeScript"], ["typescript"]);
    expect(matching).toEqual(["TypeScript"]);
  });

  it("behält die Reihenfolge des Bedarfs — sie ist nach Wichtigkeit sortiert", () => {
    const { matching } = skillOverlap(
      ["Python", "Docker", "PostgreSQL"],
      ["PostgreSQL", "Docker", "Python"],
    );
    expect(matching).toEqual(["Python", "Docker", "PostgreSQL"]);
  });

  it("zählt dieselbe Erfahrung nicht doppelt", () => {
    const { matching } = skillOverlap(["React", "React.js"], ["React"]);
    expect(matching).toHaveLength(1);
  });

  it("kommt mit leeren Listen zurecht", () => {
    expect(skillOverlap([], ["React"])).toEqual({ matching: [], other: [] });
    expect(skillOverlap(["React"], [])).toEqual({
      matching: [],
      other: ["React"],
    });
  });
});
