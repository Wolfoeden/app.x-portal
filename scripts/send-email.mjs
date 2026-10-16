import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

// Run on Node 24 with NODE_USE_ENV_PROXY=1 in the managed cloud runner.
// A failed/ambiguous request is never automatically retried: it may have sent.
try {
  const { values } = parseArgs({
    options: {
      to: { type: "string" },
      subject: { type: "string" },
      "text-file": { type: "string" },
      kind: { type: "string" },
    },
  });
  if (!values.to || !values.subject || !values["text-file"] ||
      !["transactional", "cold_outreach", "newsletter"].includes(values.kind)) {
    throw new Error("Usage: node scripts/send-email.mjs --to ADDRESS --subject SUBJECT --text-file PATH --kind transactional|cold_outreach|newsletter");
  }
  const token = process.env.EMAIL_RELAY_TOKEN?.trim();
  if (!token || token.length < 32 || token.length > 256) {
    throw new Error("EMAIL_RELAY_TOKEN must be configured securely (32–256 characters).");
  }
  const endpoint = new URL(process.env.EMAIL_RELAY_URL || "https://x-portal.eu/api/email/send");
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("EMAIL_RELAY_URL must be an HTTPS URL without credentials, query or fragment.");
  }
  const text = await readFile(values["text-file"], "utf8");
  if (!text.trim() || text.trim().length > 16_000 || values.subject.length > 200 || /[\r\n]/u.test(values.subject)) {
    throw new Error("Message exceeds the relay limits or has an invalid subject.");
  }
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ to: values.to, subject: values.subject, text, kind: values.kind }),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json();
  if (!response.ok || result.accepted !== true) {
    throw new Error(`Relay rejected the request (HTTP ${response.status}). Check the deployed relay configuration.`);
  }
  console.log("IONOS accepted the message for delivery. Inbox delivery is not confirmed.");
} catch (error) {
  // Network errors may contain URLs or request metadata; only local validation
  // errors and our own HTTP status messages are safe to display.
  console.error(error?.constructor === Error ? error.message : "Request failed; delivery is unconfirmed. Do not retry blindly.");
  process.exitCode = 1;
}
