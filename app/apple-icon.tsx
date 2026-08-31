import { ImageResponse } from "next/og";

import { BRAND_MARK_PATHS } from "@/components/BrandMark";

/** Dasselbe Zeichen in der Größe, die iOS für den Startbildschirm erwartet. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        <svg width={116} height={116} viewBox="0 0 24 24" fill="#f1f1ec">
          {BRAND_MARK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
    ),
    size,
  );
}
