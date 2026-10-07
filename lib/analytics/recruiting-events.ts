export const CLIENT_RECRUITING_EVENTS = [
  "demo_viewed", "trial_cta_clicked", "registration_completed",
  "first_analysis_succeeded", "selection_saved", "return_use", "technical_error",
] as const;
export const SERVER_RECRUITING_EVENTS = [
  "checkout_started", "trial_activated", "trial_cancelled", "first_payment",
  "subscription_renewed", "subscription_cancelled", "technical_error",
  "first_analysis_succeeded", "selection_saved", "return_use",
] as const;
export type ClientRecruitingEvent = typeof CLIENT_RECRUITING_EVENTS[number];
export type RecruitingEvent = ClientRecruitingEvent | typeof SERVER_RECRUITING_EVENTS[number];
export const RECRUITING_OUTCOMES = ["success", "failed", "cancelled", "unavailable", "authentication_required", "no_match", "partial", "ranked"] as const;
export const CAMPAIGN_SOURCES = ["direct", "google", "reddit", "linkedin", "newsletter", "referral"] as const;
export type CampaignSource = typeof CAMPAIGN_SOURCES[number];
export function campaignSource(value: string | null): CampaignSource {
  return CAMPAIGN_SOURCES.includes(value as CampaignSource) ? value as CampaignSource : "direct";
}
