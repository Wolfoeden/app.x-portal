import { ImageResponse } from "next/og";

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
          color: "#f1f1ec",
          fontSize: 120,
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
