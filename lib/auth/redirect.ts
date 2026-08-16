export function applicationOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!configuredSiteUrl) return requestOrigin;

  try {
    const configuredOrigin = new URL(configuredSiteUrl);
    if (process.env.NODE_ENV === "production") {
      if (process.env.CONTEXT === "deploy-preview") return requestOrigin;

      const hostname = configuredOrigin.hostname.toLowerCase();
      const localHostname =
        hostname === "localhost" ||
        hostname === "0.0.0.0" ||
        hostname === "::1" ||
        hostname.startsWith("127.");

      // Never allow a production callback to leave HTTPS or return to a local
      // development host. Deploy previews intentionally fall back to their
      // own request origin when a shared environment value is mis-scoped.
      if (configuredOrigin.protocol !== "https:" || localHostname) {
        return requestOrigin;
      }
    }

    return configuredOrigin.origin;
  } catch {
    return requestOrigin;
  }
}

const UNSAFE_PATH_CHARACTERS = /[\\\u0000-\u001f\u007f]/u;
const INTERNAL_VALIDATION_ORIGIN = "https://xportal.invalid";

function hasUnsafePathCharacters(candidate: string) {
  try {
    return UNSAFE_PATH_CHARACTERS.test(decodeURIComponent(candidate));
  } catch {
    return true;
  }
}

export function safeApplicationPath(
  candidate: string | null,
  fallback = "/chat",
) {
  const safeCandidate =
    candidate?.startsWith("/") &&
    !candidate.startsWith("//") &&
    !hasUnsafePathCharacters(candidate)
      ? candidate
      : fallback;
  const destination = new URL(safeCandidate, `${INTERNAL_VALIDATION_ORIGIN}/`);

  return destination.origin === INTERNAL_VALIDATION_ORIGIN
    ? `${destination.pathname}${destination.search}${destination.hash}`
    : fallback;
}

export function applicationDestination(
  request: Request,
  candidate: string | null,
  fallback = "/chat",
) {
  const origin = applicationOrigin(request);
  const destination = new URL(
    safeApplicationPath(candidate, fallback),
    `${origin}/`,
  );

  return destination.origin === origin
    ? destination
    : new URL(fallback, `${origin}/`);
}
