# Recruiting SaaS UI checkpoint

Saved frontend changes on 2026-10-07; feature work stopped at the user's 10% quota threshold. This is an implementation checkpoint, not a release or acceptance claim.

## Implemented

- `components/marketing/FreelancerLanding.tsx`: recruiter-first software workflow, primary 14-day trial CTA, card requirement, total trial-credit allowance, renewal/cancellation disclosure, fictional result with evidence/rate/open availability, and operator conversation as a secondary route. Existing public page routes remain.
- `components/marketing/RecruitingLink.tsx`: consent-controlled analytics helper consumer for CTA and explicit demo-link clicks. The fictional result already visible in the hero is not separately impression-tracked.
- `components/marketing/landing-faq.ts`: new fee-free process and no-card example vs card-required trial clearly described.
- `app/(marketing)/preise/page.tsx`: Basic/Pro/Business pulled from central catalog, concrete monthly prices per trial CTA, renewal and credit limitations, existing-balance treatment, payment-failure explanation.
- `components/public/PublicChrome.tsx`: public CTA is the trial; login and freelancer paths remain.
- `components/chat/BillingManagement.tsx` and `/konto`: reads server billing status; actual Stripe trial end in Europe/Berlin; cancellation confirmation via POST; Stripe portal via POST; explicit payment/open-access states. The server must enforce all entitlement changes. Browser success URL provides no entitlement.
- `components/chat/account.tsx`: trial status label and billing-management panel integrated in account dialog.

## Design decisions

Preserved established white/green identity and fonts. The recruiting mandate board is the signature visual: requirements, attributed evidence, and unresolved facts remain visible together. No invented client logos, usage metrics, or time-saving claims were added. The fictional rate is labelled as a fictional example. Responsive CSS reduces workflow/pricing to single columns. Billing actions have minimum 44px height and visible keyboard focus.

## Incomplete and required before release

1. Connect `saveProjectDraft`, `readProjectDraft`, `clearProjectDraft` to ChatWorkspace; draft helper exists but frontend currently does not consume it. Preserve text before registration/checkout, restore only without overriding a currently loaded project, clear only after confirmed save. No text in URLs/Stripe metadata.
2. Update `components/chat/checkout-intent.ts`, `upgrade.ts`, `agent-launch.tsx`, `auth-continuation.ts`, `marketing/CreditSummary.tsx` and other existing marketing pages. These still contain old free-registration or placement-fee/process copy.
3. Update `components/chat/placement-dialog.tsx`: remove fee-terms consent and guest pathway; require explicit contact-data transfer consent and send `contactConsent:true`. Backend now uses fee-free introductions, so current old dialog request is incompatible.
4. Implement `/kontaktfreigabe?t=...` confirmation UI for GET `/api/introductions/consent?t=...` and POST `{token,decision:'accept'|'decline'}`; never mutate from GET.
5. Update result action hints, profile-sheet fallback paths, conversations status texts, and ensure no mandatory operator route for new requests. Preserve historical contract wording conditionally on explicit commercial model.
6. Revise legal pages `/terms`, `/privacy`, `/vermittlungsbedingungen`; preserve historical terms and mark new SaaS legal review as outstanding. Current legal text has not been updated by this frontend checkpoint.
7. Implement suitable `/agent` redirect preserving allowed campaign parameters without copying project contents.
8. Connect registration, successful analysis, saved selection and return-use analytics consumers to ChatWorkspace. Only CTA/demo click consumers were completed.
9. Review billing API response shape and migration deployment. Add account-login entry handling for `/chat?anmelden=1`; current link exists in error UI but workspace query handling is not yet added.

## Validation status

Frontend screenshot, browser, mobile and keyboard acceptance checks were not run. Existing presentation/marketing tests still assert the former fee/manual-introduction model and must be revised; especially `tests/marketing/placement-copy.test.ts`. Root agent is responsible for checkpoint lint/typecheck output. Billing behavior remains dependent on the billing agent's implementation and real Stripe test configuration. No deployment, migration execution or real charge was performed by the frontend agent.
