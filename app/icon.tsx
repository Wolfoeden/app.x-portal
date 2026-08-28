import { ImageResponse } from "next/og";

/**
 * Der Browser-Tab hatte bisher kein Zeichen — es gab kein `public/` und keine
 * Icon-Datei. Erzeugt statt als Binärdatei abgelegt, damit die Marke an einer
 * Stelle definiert ist und nicht in einem Bild eingefroren, das niemand mehr
 * bearbeiten kann.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#090909",
          color: "#f1f1ec",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.05em",
        }}
      >
        X
      </div>
    ),
    size,
  );
}
