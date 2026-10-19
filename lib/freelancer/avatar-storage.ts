import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { pseudonymizeSubject } from "@/lib/security/request";

import {
  AVATAR_BUCKET,
  AVATAR_EXTENSIONS,
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  AVATAR_OBJECT_PATH_PATTERN,
  type AvatarMimeType,
} from "./avatar-limits";

const PROFILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function mintAvatarObjectPath(
  profileId: string,
  mimeType: AvatarMimeType,
): string {
  if (!PROFILE_ID_PATTERN.test(profileId)) throw new Error("invalid_profile_id");
  return `${profileId}/avatar-${randomBytes(16).toString("hex")}.${AVATAR_EXTENSIONS[mimeType]}`;
}

export function signAvatarObjectPath(objectPath: string): string {
  return pseudonymizeSubject(`freelancer-avatar:${objectPath}`);
}

export function verifyAvatarObjectPath(
  profileId: string,
  objectPath: string,
  token: string,
): boolean {
  if (!AVATAR_OBJECT_PATH_PATTERN.test(objectPath)) return false;
  if (!objectPath.startsWith(`${profileId}/`)) return false;
  if (!/^[0-9a-f]{64}$/u.test(token)) return false;

  const expected = Buffer.from(signAvatarObjectPath(objectPath), "utf8");
  const provided = Buffer.from(token, "utf8");
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

function hasMagicBytes(bytes: Uint8Array, mimeType: AvatarMimeType): boolean {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

export async function inspectUploadedAvatar(
  admin: SupabaseClient,
  objectPath: string,
): Promise<{ mimeType: AvatarMimeType; sizeBytes: number } | null> {
  const separator = objectPath.lastIndexOf("/");
  const folder = objectPath.slice(0, separator);
  const filename = objectPath.slice(separator + 1);
  const { data: listed, error: listError } = await admin.storage
    .from(AVATAR_BUCKET)
    .list(folder, { search: filename, limit: 1 });
  if (listError) throw listError;

  const object = listed?.find((entry) => entry.name === filename);
  if (!object) return null;
  const metadata = (object.metadata ?? {}) as {
    size?: number;
    mimetype?: string;
  };
  const mimeType = metadata.mimetype;
  const sizeBytes = metadata.size;
  if (
    typeof sizeBytes !== "number" ||
    sizeBytes < 1 ||
    sizeBytes > AVATAR_MAX_BYTES ||
    typeof mimeType !== "string" ||
    !(AVATAR_MIME_TYPES as readonly string[]).includes(mimeType)
  ) {
    return null;
  }

  const { data: file, error: downloadError } = await admin.storage
    .from(AVATAR_BUCKET)
    .download(objectPath);
  if (downloadError || !file) return null;
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!hasMagicBytes(bytes, mimeType as AvatarMimeType)) return null;

  return { mimeType: mimeType as AvatarMimeType, sizeBytes };
}

export { AVATAR_BUCKET };
