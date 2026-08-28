import type { NextConfig } from "next";

import { buildContentSecurityPolicy } from "./lib/security/csp";

const isProduction = process.env.NODE_ENV === "production";
const configuredBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH
  ?.trim()
  .replace(/^\/+|\/+$/gu, "");
const basePath = configuredBasePath ? `/${configuredBasePath}` : undefined;
// Die durchgesetzte Fassung — vorerst noch mit `unsafe-inline`. Die
// Nonce-Fassung läuft daneben als Report-Only aus `proxy.ts`; erst wenn deren
// Meldungen leer bleiben, tauschen die beiden die Rollen.
const contentSecurityPolicy = buildContentSecurityPolicy({ isProduction });

const buildVersion =
  process.env.COMMIT_REF?.trim().slice(0, 12) ||
  process.env.DEPLOY_ID?.trim().slice(0, 24) ||
  "development";

const nextConfig: NextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
  poweredByHeader: false,
  typedRoutes: false,
  async redirects() {
    return [
      // /home was the Cardano page until the root became the product. External
      // links, bookmarks and the whitelist confirmation still point here.
      { source: "/home", destination: "/cardano", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // /chat is the landing page now and must be indexable. Its operator
        // sub-routes stay out of the index; see netlify.toml for /chat/*.
        source: "/chat",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
