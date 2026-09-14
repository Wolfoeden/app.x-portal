"use client";

/**
 * Die letzte Auffangstelle: Sie greift, wenn das Wurzel-Layout selbst
 * fehlschlägt, und ersetzt es deshalb vollständig — einschließlich `html` und
 * `body`.
 *
 * Bewusst mit Inline-Stilen und ohne Import des Stylesheets: Wenn das Layout
 * kaputt ist, kann auch das Laden der Stile die Ursache sein. Diese Seite muss
 * ohne alles funktionieren.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#ffffff",
          color: "#181817",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <main style={{ width: "min(100%, 620px)" }}>
          <p
            style={{
              margin: "0 0 22px",
              borderTop: "3px solid #17804d",
              paddingTop: "12px",
              font: "12px ui-monospace, monospace",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#17804d",
            }}
          >
            XPORTAL
          </p>
          <h1
            style={{
              margin: "0 0 16px",
              fontSize: "clamp(28px, 6vw, 44px)",
              fontWeight: 560,
              letterSpacing: "-0.04em",
              lineHeight: 1.1,
            }}
          >
            Die Anwendung konnte nicht geladen werden.
          </h1>
          <p style={{ margin: "0 0 28px", color: "#5f5f5a", lineHeight: 1.65 }}>
            Bitte laden Sie die Seite neu. Bleibt es dabei, schreiben Sie uns an{" "}
            <a href="mailto:info@x-portal.eu" style={{ color: "#181817" }}>
              info@x-portal.eu
            </a>
            {error.digest ? ` und nennen Sie die Kennung ${error.digest}.` : "."}
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              padding: "14px 28px",
              minHeight: "44px",
              border: "1px solid #181817",
              borderRadius: "10px",
              background: "#181817",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 650,
              cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>

          <p style={{ margin: "28px 0 0", fontSize: "12px" }}>
            <a href="/imprint" style={{ color: "#5f5f5a" }}>Impressum</a>
            {" · "}
            <a href="/privacy" style={{ color: "#5f5f5a" }}>Datenschutz</a>
          </p>
        </main>
      </body>
    </html>
  );
}
