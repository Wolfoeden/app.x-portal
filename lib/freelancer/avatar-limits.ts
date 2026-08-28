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

/** Der Pfad, unter dem die Anwendung ein Profilbild ausliefert. */
export const AVATAR_IMAGE_ROUTE = "/api/freelancer/avatar-image";

/**
 * Die Adresse eines Profilbilds.
 *
 * Sie zeigt bewusst nicht mehr direkt auf Supabase Storage. Der Bucket war
 * öffentlich, das Bild also weltweit abrufbar — unabhängig davon, ob das
 * Profil noch aktiv ist und ob der Abrufende überhaupt angemeldet war. Ein
 * unratbarer Pfad ist kein Zugriffsschutz, und ein Porträtfoto ist ein
 * personenbezogenes Datum.
 *
 * Die Route mintet stattdessen bei jedem Abruf eine kurzlebige signierte URL —
 * derselbe Weg, den der Lebenslauf längst geht. Die Adresse bleibt dabei
 * stabil, was wichtig ist, weil sie in gespeicherten Match-Snapshots liegt:
 * eine signierte URL im Snapshot wäre nach einer Stunde tot.
 */
export function avatarImageUrl(objectPath: string | null): string | null {
  if (!objectPath || !AVATAR_OBJECT_PATH_PATTERN.test(objectPath)) return null;
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${AVATAR_IMAGE_ROUTE}/${encoded}`;
}

/**
 * Holt den Objektpfad aus einer gespeicherten Adresse zurück.
 *
 * Ältere Match-Snapshots tragen die frühere öffentliche Storage-URL. Sie ist
 * tot, sobald der Bucket privat ist, deshalb wird sie beim Lesen auf die neue
 * Route umgeschrieben statt in der Datenbank angefasst zu werden.
 */
export function avatarObjectPathFrom(value: string | null): string | null {
  if (!value) return null;

  const legacy = /\/storage\/v1\/object\/public\/freelancer-avatars\/(.+)$/u.exec(
    value,
  );
  const routed = new RegExp(`^${AVATAR_IMAGE_ROUTE}/(.+)$`, "u").exec(value);
  const raw = legacy?.[1] ?? routed?.[1] ?? value;

  let objectPath: string;
  try {
    objectPath = raw.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }

  return AVATAR_OBJECT_PATH_PATTERN.test(objectPath) ? objectPath : null;
}

/** Eine gespeicherte Adresse in die Form bringen, die heute gilt. */
export function normalizeAvatarUrl(value: string | null): string | null {
  return avatarImageUrl(avatarObjectPathFrom(value));
}
