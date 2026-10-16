# Send IONOS email from a cloud runner

The runner cannot open public SMTP connections. `POST /api/email/send` runs on
Netlify and calls the existing IONOS delivery function. The runner calls this
endpoint over HTTPS. SMTP credentials stay on Netlify.

## Activation

1. In Netlify site **app-x-portal-chat** (site ID
   `a269db81-61d6-4f3b-95a1-01097bf8d256`), configure production Functions variables:
   `SMTP_HOST=smtp.ionos.de`, `SMTP_PORT=587`, the real `SMTP_USER`,
   `SMTP_PASSWORD`, and `EMAIL_FROM=info@x-portal.eu`.
2. Create a separate random token (for example with a password manager),
   32–256 characters long. Set the same value as `EMAIL_RELAY_TOKEN` in
   Netlify and the cloud environment's secure variable settings. Do not reuse
   the mailbox password or unsubscribe secret. Never commit or log the token.
3. Set `EMAIL_RELAY_ALLOWED_RECIPIENTS=roman@dering.info` in Netlify. Additional
   recipients must be explicitly added as comma-separated full addresses.
   An absent, empty or invalid list disables the endpoint.
4. Release through the repository's normal main/Netlify deployment workflow.
   Cloud variables are not automatically copied to Netlify. SMTP configuration
   in one runtime does not establish configuration in the other.

## Send

Save the intended plain-text message to a local file, then run in the checkout:

```sh
NODE_USE_ENV_PROXY=1 node scripts/send-email.mjs \
  --to roman@dering.info \
  --subject 'XPORTAL – Versandtest' \
  --text-file /tmp/xportal-test-email.txt \
  --kind transactional
```

`NODE_USE_ENV_PROXY=1` requires Node 24 and preserves the managed HTTPS proxy.
`EMAIL_RELAY_URL` defaults to `https://x-portal.eu/api/email/send`; set it only
to a trusted HTTPS deployment. Redirects are rejected to protect the token.

Every request must specify `kind`: `transactional`, `cold_outreach` or
`newsletter`. Promotional mail still requires the existing unsubscribe secret
and working Supabase suppression-list checks. The caller cannot set the SMTP
server, sender, headers or attachments. Requests are limited to one permitted
recipient, a 200-character subject and 16,000 characters of plain text.
An additional in-memory limit permits 10 attempts per minute per instance;
it is not a global Netlify quota.

HTTP 200 means the SMTP server accepted the message, not that the recipient's
inbox received it. On a timeout, delivery is uncertain: do not retry blindly.
Rotate the relay token and redeploy to revoke access. The endpoint is disabled
until both token and recipient list have been configured.
