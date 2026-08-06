# Processor and subprocessor register

Controller/legal-entity details and internal approval signatures remain client
records. The provider links were checked on 2026-08-06; a link is evidence of
availability, not evidence that the client accepted the agreement.

| Provider | Purpose and data | Region/transfer mechanism | Current V1 status and evidence |
|---|---|---|---|
| Supabase, Inc. | Auth, EU Postgres, backups and operator Studio; identity, project/message/profile/workflow/audit records | Managed project `xmoxzfqmcnsntvqxhtfb` is verified in `eu-west-1`; DPA includes its stated transfer terms | Technically selected. Plan, signed/accepted [current DPA](https://supabase.com/downloads/docs/Supabase%2BDPA%2B260601.pdf), [subprocessor terms](https://supabase.com/terms) and restore capability require client sign-off. |
| OpenAI Ireland Ltd. / OpenAI API | Brief extraction; request text, pseudonymous safety identifier and usage | DPA/SCC mechanism and current subprocessor locations; no provider-side conversation state; request uses `store: false` | Technically selected but key not yet configured. Approve the [current DPA](https://openai.com/policies/data-processing-addendum/) and [subprocessor list](https://openai.com/policies/sub-processor-list/). |
| Google | Optional OAuth identity; account identifier, email and OAuth metadata | Google provider terms and approved transfer assessment | Not enabled yet. Activate only after OAuth configuration, consent-screen approval and the client's Google privacy/DPA assessment. |
| Microsoft | Optional Azure OAuth identity; account identifier, email and OAuth metadata | Current Microsoft DPA/SCC terms | Not enabled yet. Activate only after tenant configuration and approval of the [Microsoft DPA](https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA?lang=1). |
| Calendly LLC | User-initiated booking; only data the user enters directly on Calendly | Calendly DPA incorporates stated transfer safeguards; processing may involve listed non-EU subprocessors | Selected click-to-load provider. Approve the [Calendly DPA](https://calendly.com/legal/data-processing-addendum) and [subprocessor list](https://calendly.com/help/calendly-sub-processors-gdpr-ccpa). No application request occurs before click. |
| Production SMTP provider | Email verification and notices; email address and delivery metadata | Must be selected with approved region/transfer and retention | **Not selected — launch blocker for reliable email sign-up.** Add legal entity, DPA, subprocessor list, EU setting and retention before activation. |
| Client-owned server/host | Application runtime and redacted logs; encrypted traffic and pseudonymous events | Client-controlled hosting location | Selected infrastructure class; record provider/legal entity, physical region, log destination/retention and hosting agreement before launch. |

No payment processor is used in V1.
