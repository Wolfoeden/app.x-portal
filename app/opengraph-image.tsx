import { ImageResponse } from "next/og";

/**
 * Das Vorschaubild, wenn jemand einen XPORTAL-Link in einem Chat teilt.
 *
 * Bisher gab es keines: Der Link erschien als nackte Adresse, was bei einem
 * Produkt, das über Empfehlungen weitergegeben wird, jedes Mal Vertrauen
 * kostet. Der Aufbau folgt den Rechtsseiten — heller Grund, schwarze Schrift,
 * eine Linie, kein Effekt.
 */
export const alt = "XPORTAL — Freelancer finden im Dialog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "72px 80px",
          background: "#f1f1ec",
          color: "#090909",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 20,
            letterSpacing: "0.14em",
            color: "#6b6b67",
          }}
        >
          <span>XPORTAL</span>
          <span>X-PORTAL.EU</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 700,
              letterSpacing: "-0.045em",
              lineHeight: 1.05,
            }}
          >
            Beschreiben Sie das Projekt.
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 34,
              lineHeight: 1.35,
              color: "#51514d",
            }}
          >
            Passende Freelancer-Profile nach nachvollziehbaren Regeln — die
            Auswahl treffen Sie.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            paddingTop: 28,
            borderTop: "2px solid #090909",
            fontSize: 22,
            color: "#51514d",
          }}
        >
          KI strukturiert die Anfrage · das Matching folgt festen Regeln
        </div>
      </div>
    ),
    size,
  );
}
