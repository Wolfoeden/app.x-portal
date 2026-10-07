export function agentDestination(params: URLSearchParams): string {
  const safe = new URLSearchParams();
  for (const [key, value] of params) {
    if (["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"].includes(key) && value.length <= 200) safe.set(key, value);
    if (["project", "profil"].includes(key) && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value)) safe.set(key, value);
  }
  return `/chat${safe.size ? `?${safe}` : ""}`;
}
