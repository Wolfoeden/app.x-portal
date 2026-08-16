# Processor and subprocessor register

Controller/legal-entity details and internal approval signatures remain client
records. The provider links were checked on 2026-08-06; a link is evidence of
availability, not evidence that the client accepted the agreement.

| Provider | Purpose and data | Region/transfer mechanism | Current V1 status and evidence |
|---|---|---|---|
| Netlify, Inc. | Hosting, CDN, Next.js server functions and technical request/error logs | Netlify DPA with its transfer terms, including applicable SCC/DPF safeguards | Technically selected as the production host. Record the accepted [Netlify DPA](https://www.netlify.com/v3/static/pdf/netlify-dpa.pdf), account log-retention setting, subprocessor review and operational contact in the controller evidence. |
| Supabase | Auth, EU Postgres, backups and operator Studio; identity, project/message/profile/workflow/audit records | Managed project `xmoxzfqmcnsntvqxhtfb` is verified in `eu-west-1`; DPA includes its stated transfer terms | Technically selected. Plan, signed/accepted [current DPA](https://supabase.com/downloads/docs/Supabase%2BDPA%2B260601.pdf), [subprocessor terms](https://supabase.com/terms) and restore capability remain controller records outside this repository. |
| OpenAI Ireland Ltd. / OpenAI API | Brief extraction and explicit external search; request text or structured brief, pseudonymous safety identifier and usage | DPA/SCC mechanism and current subprocessor locations; requests use `store: false`, while separate provider abuse-monitoring retention may apply | Technically active through the direct API. Record acceptance of the [current DPA](https://openai.com/policies/data-processing-addendum/), [subprocessor list](https://openai.com/policies/sub-processor-list/) and the project data-control setting. |
| Google | Optional OAuth identity after an explicit user click; account identifier, email and approved OAuth metadata | Google provider terms and the controller-approved transfer assessment | Production UI activation is prepared. The controller confirmed the Supabase production redirect allowlist on 2026-08-16. Record consent-screen/provider approval and the Google privacy/transfer assessment; re-test the live callback after release. |
| Microsoft | Optional Azure OAuth identity; account identifier, email and OAuth metadata | Current Microsoft DPA/SCC terms | Not enabled yet. Activate only after tenant configuration and approval of the [Microsoft DPA](https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA?lang=1). |
| Calendly LLC | User-initiated booking; only data the user enters directly on Calendly | Calendly DPA incorporates stated transfer safeguards; processing may involve listed non-EU subprocessors | Selected click-to-load provider. Approve the [Calendly DPA](https://calendly.com/legal/data-processing-addendum) and [subprocessor list](https://calendly.com/help/calendly-sub-processors-gdpr-ccpa). No application request occurs before click. |
| Production SMTP provider | Email verification and notices; email address and delivery metadata | Must be selected with approved region/transfer and retention | **Not selected — launch blocker for reliable email sign-up.** Add legal entity, DPA, subprocessor list, EU setting and retention before activation. |

No payment processor is used in V1.
