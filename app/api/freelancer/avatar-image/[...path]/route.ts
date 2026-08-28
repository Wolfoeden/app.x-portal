import { NextResponse } from "next/server";

import {
  AVATAR_BUCKET,
  AVATAR_OBJECT_PATH_PATTERN,
} from "@/lib/freelancer/avatar-limits";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liefert ein Profilbild aus dem privaten Bucket aus.
 *
 * Vorher lag der Bucket öffentlich: Wer die Adresse hatte, kam an das Bild —
 * unabhängig davon, ob das Profil noch aktiv war, ob es ersetzt worden war
 * oder ob überhaupt jemand angemeldet war. Ein 32-stelliger Zufallspfad ist
 * kein Zugriffsschutz, sondern nur eine schlecht auffindbare Adresse.
 *
 * Hier wird stattdessen bei jedem Abruf geprüft, ob der angefragte Pfad noch
 * das *aktuelle* Bild eines existierenden Profils ist, und erst dann eine
 * kurzlebige signierte URL erzeugt. Ein ersetztes oder verwaistes Objekt ist
 * damit sofort unerreichbar, auch wenn seine Adresse noch irgendwo steht.
 */

/** Kurz genug, dass eine geteilte Adresse nichts wert ist. */
const SIGNED_URL_TTL_SECONDS = 300;

/** Deutlich unter der Gültigkeit, damit kein Cache eine tote URL hält. */
const BROWSER_CACHE_SECONDS = 60;

function notFound() {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const segments = (await context.params).path ?? [];
    if (segments.length !== 2) return notFound();

    let objectPath: string;
    try {
      objectPath = segments.map((segment) => decodeURIComponent(segment)).join("/");
    } catch {
      return notFound();
    }
    if (!AVATAR_OBJECT_PATH_PATTERN.test(objectPath)) return notFound();

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return notFound();
    const admin = createAdminSupabaseClient();

    const [profileId] = objectPath.split("/");
    const { data: profile, error } = await admin
      .from("freelancer_profiles")
      .select("id")
      .eq("id", profileId)
      // Der Pfad allein genügt nicht: Er muss das aktuell hinterlegte Bild
      // sein, sonst bliebe ein ausgetauschtes Foto weiter abrufbar.
      .eq("avatar_path", objectPath)
      .maybeSingle();
    if (error || !profile) return notFound();

    const { data: signed, error: signError } = await admin.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) return notFound();

    return NextResponse.redirect(signed.signedUrl, {
      status: 307,
      headers: {
        // Privat, weil die Weiterleitung auf eine signierte Adresse zeigt:
        // ein geteilter Cache dürfte sie nicht an andere ausliefern.
        "Cache-Control": `private, max-age=${BROWSER_CACHE_SECONDS}`,
      },
    });
  } catch {
    return notFound();
  }
}
