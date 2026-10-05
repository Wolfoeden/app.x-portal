import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { GITHUB_LOGIN_PATTERN, linkedIdentities } from "@/lib/auth/linked-identities";
import { draftFromGithub } from "@/lib/freelancer/import/github";
import { fetchGithubProfile } from "@/lib/freelancer/import/github-fetch";
import { assertSameOrigin, pseudonymizeSubject, readJsonWithLimit } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ImportSchema = z
  .object({
    // Ein Name oder eine Profiladresse; ohne Angabe gilt das verknüpfte Konto.
    login: z.string().trim().max(120).nullish(),
  })
  .strict();

const NO_STORE = { "Cache-Control": "private, no-store" };

function failure(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/** „octocat“, „@octocat“ oder „https://github.com/octocat“ ergeben „octocat“. */
function loginFrom(value: string): string | null {
  const trimmed = value.trim().replace(/^@/u, "");
  const fromUrl = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#\s]+)\/?$/iu.exec(trimmed)?.[1];
  const login = fromUrl ?? trimmed;
  return GITHUB_LOGIN_PATTERN.test(login) ? login : null;
}

/**
 * Öffentliche GitHub-Daten als Profilentwurf. Ein selbst eingetippter Name
 * ist eine Angabe wie jede andere; nur das verknüpfte Konto gilt als
 * „verbunden“. Der Entwurf wird nicht gespeichert.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) return failure(403, "Ein dauerhaftes Konto ist erforderlich.");

    const parsed = ImportSchema.safeParse(await readJsonWithLimit(request, 1_000));
    if (!parsed.success) return failure(400, "Bitte einen GitHub-Nutzernamen angeben.");

    const linked = await linkedIdentities();
    const typed = parsed.data.login ? loginFrom(parsed.data.login) : null;
    if (parsed.data.login && !typed) return failure(400, "Das ist kein gültiger GitHub-Nutzername.");
    const login = typed ?? linked.githubLogin;
    if (!login) return failure(400, "Bitte einen GitHub-Nutzernamen angeben.");

    const userHash = pseudonymizeSubject(`user:${user.id}`);
    const limit = await consumeRateLimit(`freelancer-github-import:${userHash}`, 10, 60 * 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Zu viele Abrufe. Bitte später erneut versuchen." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const result = await fetchGithubProfile(login);
    if (result.status === "not_found") return failure(404, "Dieses GitHub-Konto gibt es nicht.");
    if (result.status === "rate_limited") return failure(503, "GitHub antwortet gerade nicht. Bitte später erneut versuchen.");
    if (result.status !== "ok") return failure(502, "GitHub konnte nicht gelesen werden. Bitte später erneut versuchen.");

    const draft = draftFromGithub({
      login,
      linked: Boolean(linked.githubLogin && linked.githubLogin.toLowerCase() === login.toLowerCase()),
      repos: result.repos,
      languages: result.languages,
      importedAt: new Date().toISOString(),
    });
    return NextResponse.json({ draft }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) return error;
    return failure(503, "GitHub konnte gerade nicht gelesen werden.");
  }
}
