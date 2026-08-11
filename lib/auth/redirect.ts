export function applicationOrigin(request: Request) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return new URL(configuredSiteUrl).origin;
  }

  return new URL(request.url).origin;
}

const UNSAFE_PATH_CHARACTERS = /[\\\u0000-\u001f\u007f]/u;

export function applicationDestination(
  request: Request,
  candidate: string | null,
  fallback = "/chat",
) {
  const origin = applicationOrigin(request);
  const safeCandidate =
    candidate?.startsWith("/") &&
    !candidate.startsWith("//") &&
    !UNSAFE_PATH_CHARACTERS.test(candidate)
      ? candidate
      : fallback;
  const destination = new URL(safeCandidate, `${origin}/`);

  return destination.origin === origin
    ? destination
    : new URL(fallback, `${origin}/`);
}
