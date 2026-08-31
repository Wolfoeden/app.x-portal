import { ImageResponse } from "next/og";

import { BRAND_MARK_PATHS } from "@/components/BrandMark";

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
        }}
      >
        <svg width={21} height={21} viewBox="0 0 24 24" fill="#f1f1ec">
          {BRAND_MARK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
    ),
    size,
  );
}
