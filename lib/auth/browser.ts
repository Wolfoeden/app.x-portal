"use client";

import type { Provider } from "@supabase/supabase-js";

import { appPath } from "@/lib/app-path";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

const supportedOauthProviders = {
  google: "google",
  microsoft: "azure",
} as const satisfies Record<string, Provider>;

function siteUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3001"
  );
}

function oauthDestination() {
  const chatPath = appPath("/chat");
  if (typeof window === "undefined") return chatPath;
  if (window.location.pathname !== chatPath) return chatPath;

  const params = new URLSearchParams(window.location.search);
  return params.get("admin-login") === "1"
    ? `${chatPath}?admin-login=1`
    : chatPath;
}

export async function ensureGuestSession() {
  const supabase = getBrowserSupabaseClient();
  const { data: existing } = await supabase.auth.getClaims();
  if (existing?.claims?.sub) return existing.claims;

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(
      "Der temporÃ¤re Zugang ist noch nicht verfÃ¼gbar. Bitte versuchen Sie es spÃ¤ter erneut.",
      { cause: error },
    );
  }

  const { data, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !data?.claims?.sub) {
    throw new Error(
      "Der temporÃ¤re Zugang konnte nicht sicher gestartet werden. Bitte versuchen Sie es spÃ¤ter erneut.",
      { cause: claimsError },
    );
  }

  return data.claims;
}

export async function claimPreparedGuestWorkspace() {
  const response = await fetch(appPath("/api/auth/claim"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = (await response.json().catch(() => null)) as
    | { claimed?: boolean; reason?: string }
    | null;

  if (!response.ok || payload?.claimed !== true) {
    throw new Error(
      "Die bisherige Gastanfrage konnte nicht Ã¼bertragen werden. Bitte wenden Sie sich an Roman Dering.",
    );
  }
  return true;
}

export async function prepareGuestClaim() {
  const response = await fetch(appPath("/api/auth/prepare-claim"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  if (!response.ok) {
    throw new Error("The guest workspace could not be prepared for sign-in.");
  }
}

export async function startOauthUpgrade(
  providerName: keyof typeof supportedOauthProviders,
) {
  const supabase = getBrowserSupabaseClient();
  const claims = await ensureGuestSession();
  await prepareGuestClaim();
  const provider = supportedOauthProviders[providerName];
  const destination = oauthDestination();
  const redirectTo = `${siteUrl()}${appPath("/auth/callback")}?next=${encodeURIComponent(destination)}`;
  const options = {
    redirectTo,
    ...(providerName === "microsoft" ? { scopes: "email" } : {}),
  };

  if (claims.is_anonymous === true) {
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options,
    });
    if (!error) return;
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options,
  });
  if (error) throw error;
}

async function attemptPreparedGuestWorkspaceClaim() {
  const response = await fetch(appPath("/api/auth/claim"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = (await response.json().catch(() => null)) as
    | { claimed?: boolean; reason?: string }
    | null;

  if (response.ok && payload?.claimed === true) return "claimed" as const;
  if (response.status === 409 && payload?.reason === "claim_cookie_missing") {
    return "not_prepared" as const;
  }
  return "failed" as const;
}

async function prepareEmailAuthState() {
  const response = await fetch(appPath("/api/auth/email-state"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = (await response.json().catch(() => null)) as
    | { state?: string }
    | null;
  if (!response.ok || !payload?.state) {
    throw new Error("The email authentication flow could not be prepared.");
  }
  return payload.state;
}

async function consumeEmailAuthState(state: string | null) {
  if (!state) throw new Error("The email authentication state is missing.");
  const response = await fetch(appPath("/api/auth/email-state"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { verified?: boolean }
    | null;
  if (!response.ok || payload?.verified !== true) {
    throw new Error("The email authentication state is invalid or expired.");
  }
}

export async function registerEmailAccount(email: string, password: string) {
  const supabase = getBrowserSupabaseClient();
  await ensureGuestSession();
  await prepareGuestClaim();
  const destination = appPath("/chat");
  const state = await prepareEmailAuthState();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}${appPath("/auth/complete")}?next=${encodeURIComponent(destination)}&state=${encodeURIComponent(state)}`,
    },
  });
  if (error) throw error;

  if (data.session) {
    await claimPreparedGuestWorkspace();
    return { confirmationRequired: false } as const;
  }

  return { confirmationRequired: true } as const;
}

export async function signInExistingAccount(email: string, password: string) {
  const supabase = getBrowserSupabaseClient();
  await ensureGuestSessim·ó[h‘éì¶»§q«^w6Vç6—F—fRW'6öæÂFFà¢Ò¶VW7VÖÖ&–W2f7GVÂæB6öæ6—6Ræ° ¦gVæ7F–öâ6æöæ–6Ä‡GG5W&Â‡&s¢7G&–ær“¢7G&–ærÂçVÆÂ°¢G'’°¢6öç7BW&ÂÒæWrU$Â‡&r“°¢–b‡W&Âç&÷Fö6öÂÓÒ&‡GG3¢"ÇÂW&ÂçW6W&æÖRÇÂW&Âç77v÷&B’&WGW&âçVÆÃ°¢W&Âæ†6‚Ò"#°¢–b‡W&ÂçF†æÖRÓÒ"ò"’W&ÂçF†æÖRÒW&ÂçF†æÖRç&WÆ6R‚õÂò²B÷RÂ""“°¢&WGW&âW&ÂçFõ7G&–ær‚“°¢Ò6F6‚°¢&WGW&âçVÆÃ°¢Ð§Ð ¦6öç7B$ôô´”äuô„õ5E2Ò°¢&6Âæ6öÒ"À¢&6ÆVæFÇ’æ6öÒ"À¢&6ÆVæF"æævöövÆR"À¢'6gg–6Âæ6öÒ"À¢'F–G–6Âæ6öÒ"À¢'–÷V6æ&öö²æÖR"À¢'¦ö†ö&öö¶–æw2æ6öÒ"À¢&&öö¶–ærçvR"À¢'6–×Ç–&öö²æÖR"À¢&7V—G—66†VGVÆ–æræ6öÒ"À¢'7V&W76W66†VGVÆ–æræ6öÒ"À¢&ÖVWF–æw2æ‡V'7÷Bæ6öÒ"À¥Ò26öç7C° ¦W‡÷'BgVæ7F–öâ—4F—&V7D&öö¶–æuW&Â‡&s¢7G&–ær“¢&ööÆVâ°¢6öç7B6æöæ–6ÂÒ6æöæ–6Ä‡GG5W&Â‡&r“°¢–b‚6æöæ–6Â’&WGW&âfÇ6S°¢6öç7BW&ÂÒæWrU$Â†6æöæ–6Â“°¢6öç7B†÷7FæÖRÒW&Âæ†÷7FæÖRçFôÆ÷vW$66R‚“°¢–b€¢$ôô´”äuô„õ5E2ç6öÖR€¢††÷7B’Óâ†÷7FæÖRÓÓÒ†÷7BÇÂ†÷7FæÖRæVæG5v—F‚†âG¶†÷7GÖ’À¢¢’°¢&WGW&âG'VS°¢Ð¢&WGW&âòƒó¥çÅÂò’ƒó¦&öö·Æ&öö¶–æwÇ66†VGVÆWÇ66†VGVÆ–æwÆÖVWF–æwÆö–çFÖVçGÆ6ÆVæF"’ƒó¥Â÷ÂB’ö—RçFW7B€¢W&ÂçF†æÖRÀ¢“°§Ð ¦6öç7B”DTåD•E•õD•DÄU2ÒæWr6WB…°¢&G""À¢&Fö7F÷""À¢'&öb"À¢'&öfW76÷""À¢&×""À¢&×'2"À¢&×2"À¢&†W'""À¢&g&R"À¥Ò“° ¦gVæ7F–öâ–FVçF—G•Fö¶Vç2†F—7Æ”æÖS¢7G&–ær“¢7G&–æuµÒ°¢&WGW&âF—7Æ”æÖP¢ææ÷&ÖÆ—¦R‚$äd´B"¢ç&WÆ6R‚õÇ´Ö&·Ò²öwRÂ""¢çFôÆö6ÆTÆ÷vW$66R‚&VâÕU2"¢ç7Æ—B‚õµåÇ´ÆWGFW'ÕÇ´çVÖ&W'ÕÒ²÷R¢æf–ÇFW"€¢‡Fö¶Vâ’Óà¢Fö¶Vâb`¢”DTåD•E•õD•DÄU2æ†2‡Fö¶Vâ’b`¢‡Fö¶VâæÆVæwF‚ãÒ2ÇÂõåÆB²B÷RçFW7B‡Fö¶Vâ’’À¢“°§Ð ¢ò¢ ¢¢6öç6W'fF—fVÇ’&–æG2âWf–FVæ6VBU$ÂFòöæR6æF–FFRâvR&WV—&RWfW'¢¢ÖVæ–ævgVÂæÖRFö¶Vâ–âF†RU$Â†÷7B÷F‚ÂÆÆ÷v–ær6W&F÷'2÷"6ö×7@¢¢†æFÆRâVW'’7G&–æw2&R–çFVçF–öæÆÇ’–væ÷&VB&V6W6RF†W’&RV7’Fð¢¢7&÷72Ö76ö6–FRæB6öÖÖöæÇ’6öçF–âG&6¶–ærFW‡Bà¢¢ð¦W‡÷'BgVæ7F–öâW&ÄÖF6†W46æF–FFT–FVçF—G’€¢&s¢7G&–ærÀ¢F—7Æ”æÖS¢7G&–ærÀ¢“¢&ööÆVâ°¢6öç7B6æöæ–6ÂÒ6æöæ–6Ä‡GG5W&Â‡&r“°¢6öç7BFö¶Vç2Ò–FVçF—G•Fö¶Vç2†F—7Æ”æÖR“°¢–b‚6æöæ–6ÂÇÂFö¶Vç2æÆVæwF‚ÓÓÒ’&WGW&âfÇ6S° ¢6öç7BW&ÂÒæWrU$Â†6æöæ–6Â“°¢ÆWB†÷7DæEFƒ¢7G&–æs°¢G'’°¢†÷7DæEF‚ÒFV6öFUU$”6ö×öæVçB†G·W&Âæ†÷7FæÖWÒG·W&ÂçF†æÖWÖ“°¢Ò6F6‚°¢†÷7DæEF‚ÒG·W&Âæ†÷7FæÖWÒG·W&ÂçF†æÖWÖ°¢Ð¢6öç7BW&ÅFö¶Vç2Ò†÷7DæEF€¢ææ÷&ÖÆ—¦R‚$äd´B"¢ç&WÆ6R‚õÇ´Ö&·Ò²öwRÂ""¢çFôÆö6ÆTÆ÷vW$66R‚&VâÕU2"¢ç7Æ—B‚õµåÇ´ÆWGFW'ÕÇ´çVÖ&W'ÕÒ²÷R¢æf–ÇFW"„&ööÆVâ“° ¢6öç7B6ö×7DæÖRÒFö¶Vç2æ¦ö–â‚""“°¢–b‡W&ÅFö¶Vç2æ–æ6ÇVFW2†6ö×7DæÖR’’&WGW&âG'VS° ¢f÷"†ÆWB–æFW‚Ò²–æFW‚ÃÒW&ÅFö¶Vç2æÆVæwF‚ÒFö¶Vç2æÆVæwFƒ²–æFW‚³Ò’°¢–b‡Fö¶Vç2æWfW'’‚‡Fö¶VâÂöfg6WB’ÓâW&ÅFö¶Vç5¶–æFW‚²öfg6WEÒÓÓÒFö¶Vâ’’°¢&WGW&âG'VS°¢Ð¢Ð ¢&WGW&âfÇ6S°§Ð §G—R6V&6„Wf–FVæ6RÒ°¢W&Ç3¢6WCÇ7G&–æsã°¢VW&–W3¢7G&–æuµÓ°§Ó° ¦W‡÷'BgVæ7F–öâW‡G&7E6V&6„Wf–FVæ6R†÷WGWC¢Væ¶æ÷vâ“¢6V&6„Wf–FVæ6R°¢6öç7BW&Ç2ÒæWr6WCÇ7G&–æsâ‚“°¢6öç7BVW&–W2ÒæWr6WCÇ7G&–æsâ‚“°¢–b‚'&’æ—4'&’†÷WGWB’’&WGW&â²W&Ç2ÂVW&–W3¢µÒÓ° ¢f÷"†6öç7B—FVÒöb÷WGWB’°¢–b‚—FVÒÇÂG—Vöb—FVÒÓÒ&ö&¦V7B"’6öçF–çVS°¢6öç7B&V6÷&BÒ—FVÒ2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãã°¢–b‡&V6÷&BçG—RÓÓÒ'vV%÷6V&6…ö6ÆÂ"’°¢6öç7B7F–öâÒ&V6÷&Bæ7F–öã°¢–b†7F–öâbbG—Vöb7F–öâÓÓÒ&ö&¦V7B"’°¢6öç7B7F–öå&V6÷&BÒ7F–öâ2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãã°¢–b„'&’æ—4'&’†7F–öå&V6÷&BçVW&–W2’’°¢f÷"†6öç7BVW'’öb7F–öå&V6÷&BçVW&–W2’°¢–b‡G—VöbVW'’ÓÓÒ'7G&–ær"bbVW'’çG&–Ò‚’’VW&–W2æFB‡VW'’çG&–Ò‚’“°¢Ð¢Ð¢–b‡G—Vöb7F–öå&V6÷&BçVW'’ÓÓÒ'7G&–ær"bb7F–öå&V6÷&BçVW'’çG&–Ò‚’’°¢VW&–W2æFB†7F–öå&V6÷&BçVW'’çG&–Ò‚’“°¢Ð¢–b„'&’æ—4'&’†7F–öå&V6÷&Bç6÷W&6W2’’°¢f÷"†6öç7B6÷W&6Röb7F–öå&V6÷&Bç6÷W&6W2’°¢–b‚6÷W&6RÇÂG—Vöb6÷W&6RÓÒ&ö&¦V7B"’6öçF–çVS°¢6öç7BW&ÂÒ6æöæ–6Ä‡GG5W&Â€¢7G&–ær‚‡6÷W&6R2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâ’çW&Âóò""’À¢“°¢–b‡W&Â’W&Ç2æFB‡W&Â“°¢Ð¢Ð¢–b‡G—Vöb7F–öå&V6÷&BçW&ÂÓÓÒ'7G&–ær"’°¢6öç7BW&ÂÒ6æöæ–6Ä‡GG5W&Â†7F–öå&V6÷&BçW&Â“°¢–b‡W&Â’W&Ç2æFB‡W&Â“°¢Ð¢Ð¢Ð ¢–b‡&V6÷&BçG—RÓÒ&ÖW76vR"ÇÂ'&’æ—4'&’‡&V6÷&Bæ6öçFVçB’’6öçF–çVS°¢f÷"†6öç7B6öçFVçBöb&V6÷&Bæ6öçFVçB’°¢–b‚6öçFVçBÇÂG—Vöb6öçFVçBÓÒ&ö&¦V7B"’6öçF–çVS°¢6öç7Bææ÷FF–öç2Ò†6öçFVçB2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâ’æææ÷FF–öç3°¢–b‚'&’æ—4'&’†ææ÷FF–öç2’’6öçF–çVS°¢f÷"†6öç7Bææ÷FF–öâöbææ÷FF–öç2’°¢–b‚ææ÷FF–öâÇÂG—Vöbææ÷FF–öâÓÒ&ö&¦V7B"’6öçF–çVS°¢6öç7Bææ÷FF–öå&V6÷&BÒææ÷FF–öâ2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãã°¢–b†ææ÷FF–öå&V6÷&BçG—RÓÒ'W&Åö6—FF–öâ"’6öçF–çVS°¢6öç7BW&ÂÒ6æöæ–6Ä‡GG5W&Â…7G&–ær†ææ÷FF–öå&V6÷&BçW&Âóò""’“°¢–b‡W&Â’W&Ç2æFB‡W&Â“°¢Ð¢Ð¢Ð ¢&WGW&â²W&Ç2ÂVW&–W3¢²ââçVW&–W5Òç6Æ–6RƒÂ#’Ó°§Ð ¦W‡÷'BgVæ7F–öâ&V6öæ6–ÆTW‡FW&æÄ6æF–FFW2€¢6æF–FFT÷WGWC¢Væ¶æ÷vâÀ¢÷WGWC¢Væ¶æ÷vâÀ¢“¢°¢6æF–FFW3¢W‡FW&æÄg&VVÆæ6W$6æF–FFUµÓ°¢Wf–FVæ6S¢6V&6„Wf–FVæ6S°§Ò°¢6öç7B'6VBÒW‡FW&æÄg&VVÆæ6W%6V&6„÷WGWE66†VÖç6fU'6R†6æF–FFT÷WGWB“°¢6öç7BWf–FVæ6RÒW‡G&7E6V&6„Wf–FVæ6R†÷WGWB“°¢–b‚'6VBç7V66W72’&WGW&â²6æF–FFW3¢µÒÂWf–FVæ6RÓ° ¢6öç7B6VVâÒæWr6WCÇ7G&–æsâ‚“°¢6öç7B6æF–FFW3¢W‡FW&æÄg&VVÆæ6W$6æF–FFUµÒÒµÓ°¢f÷"†6öç7B6æF–FFRöb'6VBæFFæ6æF–FFW2’°¢6öç7B&öf–ÆUW&ÂÒ6æöæ–6Ä‡GG5W&Â†6æF–FFRç&öf–ÆUW&Â“°¢6öç7B&öö¶–æuW&ÂÒ6æöæ–6Ä‡GG5W&Â†6æF–FFRæ&öö¶–æuW&Â“°¢–b‚&öf–ÆUW&ÂÇÂ&öö¶–æuW&ÂÇÂ—4F—&V7D&öö¶–æuW&Â†&öö¶–æuW&Â’’6öçF–çVS°¢–b‚Wf–FVæ6RçW&Ç2æ†2‡&öf–ÆUW&Â’ÇÂWf–FVæ6RçW&Ç2æ†2†&öö¶–æuW&Â’’6öçF–çVS°¢–b€¢W&ÄÖF6†W46æF–FFT–FVçF—G’‡&öf–ÆUW&ÂÂ6æF–FFRæF—7Æ”æÖR’ÇÀ¢W&ÄÖF6†W46æF–FFT–FVçF—G’†&öö¶–æuW&ÂÂ6æF–FFRæF—7Æ”æÖR¢’°¢6öçF–çVS°¢Ð ¢6öç7B6÷W&6UW&Ç2Ò²ââææWr6WB†6æF–FFRç6÷W&6UW&Ç2æÖ†6æöæ–6Ä‡GG5W&Â’•Ð¢æf–ÇFW"‚‡W&Â“¢W&Â—27G&–ærÓâ&ööÆVâ‡W&ÂbbWf–FVæ6RçW&Ç2æ†2‡W&Â’’¢ç6Æ–6RƒÂ‚“°¢–b‚6÷W&6UW&Ç2æ–æ6ÇVFW2‡&öf–ÆUW&Â’ÇÂ6÷W&6UW&Ç2æ–æ6ÇVFW2†&öö¶–æuW&Â’’6öçF–çVS°¢–b‡6VVâæ†2†&öö¶–æuW&Â’’6öçF–çVS°¢6VVâæFB†&öö¶–æuW&Â“°¢6æF–FFW2çW6‚‡°¢ââæ6æF–FFRÀ¢&öf–ÆUW&ÂÀ¢&öö¶–æuW&ÂÀ¢6÷W&6UW&Ç2À¢fW&–f–6F–öå7FGW3¢&W‡FW&æÅ÷VçfW&–f–VB"À¢Ò“°¢–b†6æF–FFW2æÆVæwF‚ÓÓÒÔ…ôU…DU$äÅôe$TTÄä4U%õ$U5TÅE2’'&V³°¢Ð¢&WGW&â²6æF–FFW2ÂWf–FVæ6RÓ°§Ð ¦gVæ7F–öâ&÷f–FW%&WVW7B€¢'&–Vc¢&ö¦V7D'&–VbÀ¢ÖöFVÃ¢7G&–ærÀ¢6fWG”–FVçF–f–W#¢7G&–ærÀ¢“¢&W7öç6T7&VFU&×4æöå7G&VÖ–ær°¢&WGW&â°¢ÖöFVÂÀ¢–ç7G'V7F–öç3¢4T$4…ô”å5E%T5D”ôå2À¢–çWC¢°¢°¢&öÆS¢'W6W""À¢6öçFVçC¢°¢°¢G—S¢&–çWE÷FW‡B"À¢FW‡C¢$ô¤T5B%$”Tb‡VçG'W7FVBFF“¥ÆâG´¥4ôâç7G&–æv–g’†'&–Vb—ÖÀ¢ÒÀ¢ÒÀ¢ÒÀ¢ÒÀ¢FööÇ3¢·²G—S¢'vV%÷6V&6‚"Â6V&6…ö6öçFW‡E÷6—¦S¢&ÖVF—VÒ"ÕÒÀ¢FööÅö6†ö–6S¢'&WV—&VB"À¢–æ6ÇVFS¢²'vV%÷6V&6…ö6ÆÂæ7F–öâç6÷W&6W2%ÒÀ¢&V6öæ–æs¢²Vff÷'C¢&Æ÷r"ÒÀ¢FW‡C¢°¢f÷&ÖC¢¦öEFW‡Df÷&ÖB€¢W‡FW&æÄg&VVÆæ6W%6V&6„÷WGWE66†VÖÀ¢&W‡FW&æÅög&VVÆæ6W%÷6V&6‚"À¢’À¢ÒÀ¢Ö…ö÷WGWE÷Fö¶Vç3¢Ô…ôõTä•õtT%õ4T$4…ôõUEUEõDô´Tå2À¢6fWG•ö–FVçF–f–W#¢6fWG”–FVçF–f–W"À¢7F÷&S¢fÇ6RÀ¢Ó°§Ð ¦W‡÷'BgVæ7F–öâW7F–ÖFTW‡FW&æÅ6V&6…Fö¶Vä6V–Æ–ær†–çWC¢°¢'&–Vc¢&ö¦V7D'&–Vc°¢ÖöFVÃó¢7G&–æs°§Ò“¢²–çWEFö¶Vç3¢çVÖ&W#²÷WGWEFö¶Vç3¢çVÖ&W#²F÷FÅFö¶Vç3¢çVÖ&W#²ÖöFVÃ¢7G&–ærÒ°¢6öç7B'&–VbÒ&ö¦V7D'&–Ve66†VÖç'6R†–çWBæ'&–Vb“°¢6öç7BÖöFVÂÐ¢–çWBæÖöFVÃòçG&–Ò‚’ÇÀ¢&ö6W72æVçbäõTä•ôÔôDTÃòçG&–Ò‚’ÇÀ¢&ö6W72æVçbäõTä•õtT%õ4T$4…ôÔôDTÃòçG&–Ò‚’ÇÀ¢DTdTÅEôõTä•õtT%õ4T$4…ôÔôDTÃ°¢6öç7B&WVW7BÒ&÷f–FW%&WVW7B†'&–VbÂÖöFVÂÂ'V÷F÷&VfÆ–v‡B"“°¢6öç7B–çWEFö¶Vç2Ò'VffW"æ'—FTÆVæwF‚„¥4ôâç7G&–æv–g’‡&WVW7B’Â'WFc‚"“°¢&WGW&â°¢–çWEFö¶Vç2À¢÷WGWEFö¶Vç3¢Ô…ôõTä•õtT%õ4T$4…ôõUEUEõDô´Tå2À¢F÷FÅFö¶Vç3¢–çWEFö¶Vç2²Ô…ôõTä•õtT%õ4T$4…ôõUEUEõDô´Tå2À¢ÖöFVÂÀ¢Ó°§Ð ¦gVæ7F–öâ6Æ×F–ÖV÷WB‡F–ÖV÷WD×3¢çVÖ&W"“¢çVÖ&W"°¢–b‚çVÖ&W"æ—4f–æ—FR‡F–ÖV÷WD×2’’&WGW&âDTdTÅEôõTä•õtT%õ4T$4…õD”ÔTõUEôÕ3°¢&WGW&âÖF‚æÖ–â„Ô…õD”ÔTõUEôÕ2ÂÖF‚æÖ‚„Ô”åõD”ÔTõUEôÕ2ÂÖF‚ç&÷VæB‡F–ÖV÷WD×2’’“°§Ð ¦gVæ7F–öâ6öæf–wW&VEF–ÖV÷WB†÷fW'&–FSó¢çVÖ&W"“¢çVÖ&W"°¢–b†÷fW'&–FRÓÒVæFVf–æVB’&WGW&â6Æ×F–ÖV÷WB†÷fW'&–FR“°¢&WGW&â6Æ×F–ÖV÷WB€¢çVÖ&W"‡&ö6W72æVçbäõTä•õtT%õ4T$4…õD”ÔTõUEôÕ2’ÇÀ¢DTdTÅEôõTä•õtT%õ4T$4…õD”ÔTõUEôÕ2À¢“°§Ð ¦gVæ7F–öâ7&VFTFVfVÇE&W7öç6W46Æ–VçB†”¶W“¢7G&–ær“¢W‡FW&æÅ6V&6…&W7öç6W46Æ–VçB°¢6öç7B6Æ–VçBÒ7&VFT÷Vä”6Æ–VçB†”¶W’“°¢&WGW&â°¢'6R†&öG’Â÷F–öç2’°¢&WGW&â6Æ–VçBç&W7öç6W2ç'6R†&öG’Â÷F–öç2“°¢ÒÀ¢Ó°§Ð ¦gVæ7F–öâ—5F–ÖV÷WDW'&÷"†W'&÷#¢Væ¶æ÷vâ“¢&ööÆVâ°¢&WGW&â€¢W'&÷"–ç7Fæ6VöbW'&÷"b`¢òƒó§F–ÖV÷WGÇF–ÖVB÷WGÆ&÷'B’ö—RçFW7B†G¶W'&÷"ææÖWÒG¶W'&÷"æÖW76vWÖ¢“°§Ð ¦7–æ2gVæ7F–öâv—F„†&EF–ÖV÷WCÅCâ€¢÷W&F–öã¢‡6–væÃ¢&÷'E6–væÂ’Óâ&öÖ—6SÅCâÀ¢F–ÖV÷WD×3¢çVÖ&W"À¢“¢&öÖ—6SÅCâ°¢6öç7B6öçG&öÆÆW"ÒæWr&÷'D6öçG&öÆÆW"‚“°¢ÆWBF–ÖV÷WC¢&WGW&åG—SÇG—Vöb6WEF–ÖV÷WCâÂVæFVf–æVC°¢6öç7BF–ÖV÷WE&öÖ—6RÒæWr&öÖ—6SÆæWfW#â‚…÷&W6öÇfRÂ&V¦V7B’Óâ°¢F–ÖV÷WBÒ6WEF–ÖV÷WB‚‚’Óâ°¢6öçG&öÆÆW"æ&÷'B‚“°¢&V¦V7B†æWrW'&÷"‚'&÷f–FW%÷F–ÖV÷WB"’“°¢ÒÂF–ÖV÷WD×2“°¢Ò“°¢G'’°¢&WGW&âv—B&öÖ—6Rç&6R…¶÷W&F–öâ†6öçG&öÆÆW"ç6–væÂ’ÂF–ÖV÷WE&öÖ—6UÒ“°¢Òf–æÆÇ’°¢–b‡F–ÖV÷WB’6ÆV%F–ÖV÷WB‡F–ÖV÷WB“°¢Ð§Ð ¦gVæ7F–öâVæf–Æ&ÆR€¢fÆÆ&6µ&V6öã¢W‡FW&æÅ6V&6„fÆÆ&6µ&V6öâÀ¢&÷f–FW$GFV×FVBÒfÇ6RÀ¢&÷f–FW#ó¢W‡FW&æÄg&VVÆæ6W%6V&6…&W7VÇE²'&÷f–FW"%ÒÀ¢“¢W‡FW&æÄg&VVÆæ6W%6V&6…&W7VÇB°¢&WGW&â°¢6æF–FFW3¢µÒÀ¢ÖöFS¢'Væf–Æ&ÆR"À¢&÷f–FW$GFV×FVBÀ¢fÆÆ&6µ&V6öâÀ¢âââ‡&÷f–FW"ò²&÷f–FW"Ò¢·Ò’À¢6V&6…G&6S¢°¢VW&–W3¢µÒÀ¢6öç7VÇFVE6÷W&6T6÷VçC¢À¢&WGW&æVD6æF–FFT6÷VçC¢À¢ÒÀ¢Ó°§Ð ¦W‡÷'B7–æ2gVæ7F–öâ6V&6„W‡FW&æÄg&VVÆæ6W'2€¢&t–çWC¢W‡FW&æÄg&VVÆæ6W%6V&6„–çWBÀ¢÷F–öç3¢W‡FW&æÄg&VVÆæ6W%6V&6„÷F–öç2Ò·ÒÀ¢“¢&öÖ—6SÄW‡FW&æÄg&VVÆæ6W%6V&6…&W7VÇCâ°¢6öç7B–çWBÒW‡FW&æÄg&VVÆæ6W%6V&6„–çWE66†VÖç'6R‡&t–çWB“°¢–b‚–çWBæÆÆ÷u&÷f–FW"’&WGW&âVæf–Æ&ÆR‚&'VFvWEöFVæ–VB"“°¢–b‚–çWBç6fWG”–FVçF–f–W"’°¢&WGW&âVæf–Æ&ÆR‚'6fWG•ö–FVçF–f–W%÷Væf–Æ&ÆR"“°¢Ð ¢6öç7BW‡Æ–6—D”¶W’Ò÷F–öç2æ”¶W“°¢6öç7B”¶W’Ð¢W‡Æ–6—D”¶W’ÓÓÒVæFVf–æV@¢ò&ö6W72æVçbäõTä•ô•ô´U“òçG&–Ò‚¢¢W‡Æ–6—D”¶W“òçG&–Ò‚“°¢6öç7B&W7öç6W46Æ–VçBÐ¢÷F–öç2ç&W7öç6W46Æ–VçBóò†”¶W’ò7&VFTFVfVÇE&W7öç6W46Æ–VçB†”¶W’’¢çVÆÂ“°¢–b‚&W7öç6W46Æ–VçB’&WGW&âVæf–Æ&ÆR‚'&÷f–FW%÷Væf–Æ&ÆR"“° ¢6öç7BÖöFVÂÐ¢÷F–öç2æÖöFVÃòçG&–Ò‚’ÇÀ¢&ö6W72æVçbäõTä•ôÔôDTÃòçG&–Ò‚’ÇÀ¢&ö6W72æVçbäõTä•õtT%õ4T$4…ôÔôDTÃòçG&–Ò‚’ÇÀ¢DTdTÅEôõTä•õtT%õ4T$4…ôÔôDTÃ°¢6öç7BF–ÖV÷WD×2Ò6öæf–wW&VEF–ÖV÷WB†÷F–öç2çF–ÖV÷WD×2“°¢ÆWB&÷f–FW$GFV×FVBÒfÇ6S°¢ÆWB&÷f–FW#¢W‡FW&æÄg&VVÆæ6W%6V&6…&W7VÇE²'&÷f–FW"%Ó°¢G'’°¢6öç7B&WVW7BÒ&÷f–FW%&WVW7B†–çWBæ'&–VbÂÖöFVÂÂ–çWBç6fWG”–FVçF–f–W"“°¢6öç7B&W7öç6RÒv—Bv—F„†&EF–ÖV÷WB€¢‡6–væÂ’Óâ°¢&÷f–FW$GFV×FVBÒG'VS°¢&WGW&â&W7öç6W46Æ–VçBç'6R‡&WVW7BÂ°¢F–ÖV÷WC¢F–ÖV÷WD×2À¢Ö…&WG&–W3¢À¢6–væÂÀ¢Ò“°¢ÒÀ¢F–ÖV÷WD×2À¢“°¢&÷f–FW"Ò°¢&WVW7FVDÖöFVÃ¢ÖöFVÂÀ¢ÖöFVÃ¢&W7öç6RæÖöFVÃòçG&–Ò‚’ÇÂÖöFVÂÀ¢&W7öç6T–C¢&W7öç6Ræ–BÀ¢–çWEFö¶Vç3¢&W7öç6RçW6vSòæ–çWE÷Fö¶Vç2À¢66†VD–çWEFö¶Vç3¢&W7öç6RçW6vSòæ–çWE÷Fö¶Vç5öFWF–Ç3òæ66†VE÷Fö¶Vç2À¢66†Uw&—FUFö¶Vç3 ¢&W7öç6RçW6vSòæ–çWE÷Fö¶Vç5öFWF–Ç3òæ66†U÷w&—FU÷Fö¶Vç2À¢÷WGWEFö¶Vç3¢&W7öç6RçW6vSòæ÷WGWE÷Fö¶Vç2À¢F÷FÅFö¶Vç3¢&W7öç6RçW6vSòçF÷FÅ÷Fö¶Vç2À¢Ó°¢6öç7B'6VBÒW‡FW&æÄg&VVÆæ6W%6V&6„÷WGWE66†VÖç6fU'6R€¢&W7öç6Ræ÷WGWE÷'6VBÀ¢“°¢–b‚'6VBç7V66W72’&WGW&âVæf–Æ&ÆR‚&–çfÆ–Eö÷WGWB"ÂG'VRÂ&÷f–FW"“° ¢6öç7B&V6öæ6–ÆVBÒ&V6öæ6–ÆTW‡FW&æÄ6æF–FFW2‡'6VBæFFÂ&W7öç6Ræ÷WGWB“°¢&WGW&â°¢6æF–FFW3¢&V6öæ6–ÆVBæ6æF–FFW2À¢ÖöFS¢&÷Væ’"À¢&÷f–FW$GFV×FVC¢G'VRÀ¢&÷f–FW"À¢6V&6…G&6S¢°¢VW&–W3¢&V6öæ6–ÆVBæWf–FVæ6RçVW&–W2À¢6öç7VÇFVE6÷W&6T6÷VçC¢&V6öæ6–ÆVBæWf–FVæ6RçW&Ç2ç6—¦RÀ¢&WGW&æVD6æF–FFT6÷VçC¢&V6öæ6–ÆVBæ6æF–FFW2æÆVæwF‚À¢ÒÀ¢Ó°¢Ò6F6‚†W'&÷"’°¢&WGW&âVæf–Æ&ÆR€¢—5F–ÖV÷WDW'&÷"†W'&÷"’ò'&÷f–FW%÷F–ÖV÷WB"¢'&÷f–FW%öW'&÷""À¢&÷f–FW$GFV×FVBÀ¢&÷f–FW"À¢“°¢Ð§Ð