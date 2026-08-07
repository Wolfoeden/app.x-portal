const configuredBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH;

export function normalizeAppBasePath(value: string | undefined): string {
  const normalized = value?.trim().replace(/^\/+|\/+$/gu, "") ?? "";
  return normalized ? `/${normalized}` : "";
}

export const APP_BASE_PATH = normalizeAppBasePath(configuredBasePath);

export function appPath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalizedPath}`;
}
