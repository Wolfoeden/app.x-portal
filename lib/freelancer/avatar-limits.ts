export const AVATAR_BUCKET = "freelancer-avatars";
export const AVATAR_MAX_BYTES = 5_242_880;
export const AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

export const AVATAR_EXTENSIONS: Readonly<Record<AvatarMimeType, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const AVATAR_OBJECT_PATH_PATTERN =
  /^[0-9a-f-]{36}\/avatar-[0-9a-f]{32}\.(?:jpg|jpeg|png|webp)$/u;

export function publicAvatarUrl(objectPath: string | null): string | null {
  if (!objectPath || !AVATAR_OBJECT_PATH_PATTERN.test(objectPath)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!base) return null;
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
  return new URL(
    `/storage/v1/object/public/${AVATAR_BUCKET}/${encoded}`,
    base,
  ).toString();
}
