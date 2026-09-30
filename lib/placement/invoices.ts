import "server-only";

import { z } from "zod";

import { stripeRequest, StripeRequestError } from "@/lib/billing/stripe-api";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { PLACEMENT_TERMS, PLACEMENT_VAT_PERCENT } from "./config";

/**
 * Die Rechnung über das Vermittlungshonorar, erstellt und verschickt von
 * Stripe.
 *
 * Stripe vergibt die fortlaufende Rechnungsnummer, erzeugt das PDF, schickt
 * es an den Kunden und nimmt die Zahlung per Überweisung oder Karte an;
 * `invoice.paid` meldet den Eingang zurück (app/api/stripe/webhook). XPORTAL
 * liefert Empfänger, Betrag und Beschreibung.
 *
 * Absender, Anschrift und USt-IdNr. von XPORTAL stehen in den
 * Stripe-Kontoeinstellungen, nicht hier; ohne sie ist die Rechnung nicht
 * vollständig (docs/placement-invoices.md).
 *
 * Vorerst nur Empfänger in Deutschland. Eine Rechnung ins Ausland braucht je
 * nach Land Reverse-Charge-Hinweis oder einen anderen Steuersatz; die wird
 * bis dahin von Hand gestellt und im Admin mit ihrer Nummer eingetragen.
 */

/** Ob der Admin Rechnungen über Stripe anbieten kann. */
export function placementInvoicingReady(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PLACEMENT_TAX_RATE_ID?.trim());
}

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const BillingDetailsSchema = z
  .object({
    company: trimmed(200),
    contact: z.string().trim().max(200).nullish().transform((value) => value || null),
    email: z.string().trim().toLowerCase().email().max(320),
    street: trimmed(200),
    postalCode: z.string().trim().regex(/^\d{5}$/u, "Postleitzahl mit fünf Ziffern"),
    city: trimmed(120),
    country: z.literal("DE"),
    vatId: z
      .string()
      .trim()
      .toUpperCase()
      .transform((value) => value.replace(/\s+/gu, ""))
      .pipe(z.string().regex(/^(?:DE\d{9})?$/u, "USt-IdNr. im Format DE123456789"))
      .nullish()
      .transform((value) => value || null),
  })
  .strict();

export type BillingDetails = z.infer<typeof BillingDetailsSchema>;

type EngagementForInvoice = {
  id: string;
  intro_booking_id: string;
  owner_user_id: string;
  project_id: string;
  freelancer_profile_id: string;
  fee_minor: number | null;
  fee_status: "open" | "invoiced" | "paid" | "waived" | null;
  day_rate_minor: number | null;
  project_days: number | null;
  starts_on: string | null;
  terms_version: string | null;
  stripe_customer_id: string | null;
  stripe_invoice_id: string | null;
};

type StripeInvoice = {
  id: string;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  number: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  due_date: number | null;
  subtotal: number;
  total: number;
};

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

function germanDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

/** Die Rechnungszeile: wer vermittelt wurde, wofür und wie sich der Betrag ergibt. */
export function placementInvoiceLine(input: {
  freelancerName: string;
  freelancerRole: string;
  projectTitle: string | null;
  dayRateMinor: number;
  projectDays: number;
  termsVersion: string;
}): string {
  const days = Math.min(input.projectDays, PLACEMENT_TERMS.maxFeeDays);
  const subject = input.projectTitle ? ` für „${input.projectTitle}“` : "";
  return (
    `Vermittlungshonorar: ${input.freelancerName} (${input.freelancerRole})${subject}. ` +
    `${PLACEMENT_TERMS.feePercent} % von ${days} Projekttagen zu je ${euro.format(input.dayRateMinor / 100)} netto ` +
    `nach den Vermittlungsbedingungen, Fassung ${input.termsVersion}.`
  ).slice(0, 500);
}

function taxRateId(): string {
  const id = process.env.STRIPE_PLACEMENT_TAX_RATE_ID?.trim();
  if (!id || !/^txr_[A-Za-z0-9]+$/u.test(id)) {
    throw new StripeRequestError(503, "not_configured", "Der Stripe-Steuersatz fehlt (STRIPE_PLACEMENT_TAX_RATE_ID).");
  }
  return id;
}

/** Eine falsch eingerichtete Umsatzsteuer darf nie auf eine Rechnung kommen. */
async function verifiedTaxRate(): Promise<string> {
  const id = taxRateId();
  const rate = await stripeRequest<{ active: boolean; percentage: number; inclusive: boolean; country: string | null }>(
    "GET",
    `/tax_rates/${id}`,
  );
  if (!rate.active || rate.inclusive || rate.percentage !== PLACEMENT_VAT_PERCENT) {
    throw new StripeRequestError(
      503,
      "tax_rate_mismatch",
      `Der Stripe-Steuersatz ${id} muss aktiv, exklusiv und ${PLACEMENT_VAT_PERCENT} % sein.`,
    );
  }
  return id;
}

/**
 * Rechnung erstellen und verschicken.
 *
 * Jeder Schritt speichert sein Ergebnis an der Beauftragung, bevor der
 * nächste beginnt, und jeder anlegende Aufruf trägt einen Idempotenzschlüssel
 * aus der Beauftragung. Bricht ein Versuch ab, setzt der nächste Klick dort
 * fort, wo er stand, statt einen zweiten Kunden oder eine zweite Rechnung
 * anzulegen.
 */
export async function issuePlacementInvoice(introId: string, billing: BillingDetails) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("engagements")
    .select(
      "id,intro_booking_id,owner_user_id,project_id,freelancer_profile_id,fee_minor,fee_status,day_rate_minor,project_days,starts_on,terms_version,stripe_customer_id,stripe_invoice_id",
    )
    .eq("intro_booking_id", introId)
    .maybeSingle();
  if (error) throw error;
  const engagement = data as EngagementForInvoice | null;
  if (!engagement) throw new Response("Erst die Beauftragung erfassen.", { status: 409 });
  if (engagement.fee_status !== "open") {
    throw new Response("Für diese Beauftragung ist die Rechnung schon gestellt.", { status: 409 });
  }
  if (!engagement.fee_minor || engagement.fee_minor <= 0 || !engagement.day_rate_minor || !engagement.project_days || !engagement.starts_on) {
    throw new Response("Honorar, Tagessatz, Tage oder Start fehlen an der Beauftragung.", { status: 409 });
  }

  const tax = await verifiedTaxRate();

  const save = async (values: Record<string, unknown>) => {
    const { error: updateError } = await admin.from("engagements").update(values).eq("id", engagement.id);
    if (updateError) throw updateError;
  };

  await save({
    billing_company: billing.company,
    billing_contact: billing.contact,
    billing_email: billing.email,
    billing_street: billing.street,
    billing_postal_code: billing.postalCode,
    billing_city: billing.city,
    billing_country: billing.country,
    billing_vat_id: billing.vatId,
  });

  const [profile, project] = await Promise.all([
    admin.from("freelancer_profiles").select("display_name,role_title").eq("id", engagement.freelancer_profile_id).maybeSingle(),
    admin.from("projects").select("title").eq("id", engagement.project_id).maybeSingle(),
  ]);
  const profileRow = profile.data as { display_name: string; role_title: string } | null;
  const projectTitle = (project.data as { title: string | null } | null)?.title ?? null;
  const termsVersion = engagement.terms_version ?? PLACEMENT_TERMS.version;
  const metadata = {
    xportal_kind: "placement_fee",
    xportal_engagement_id: engagement.id,
    xportal_intro_booking_id: engagement.intro_booking_id,
  };

  let customerId = engagement.stripe_customer_id;
  if (!customerId) {
    const customer = await stripeRequest<{ id: string }>(
      "POST",
      "/customers",
      {
        name: billing.company,
        email: billing.email,
        address: { line1: billing.street, postal_code: billing.postalCode, city: billing.city, country: billing.country },
        preferred_locales: ["de"],
        tax_id_data: billing.vatId ? [{ type: "eu_vat", value: billing.vatId }] : undefined,
        metadata: { ...metadata, xportal_client_user_id: engagement.owner_user_id },
      },
      { idempotencyKey: `xportal-placement-customer-${engagement.id}` },
    );
    customerId = customer.id;
    await save({ stripe_customer_id: customerId });
  }

  let invoiceId = engagement.stripe_invoice_id;
  if (!invoiceId) {
    const customFields = [
      { name: "Leistungsdatum", value: `Projektstart ${germanDate(engagement.starts_on)}` },
      { name: "Vorgang", value: engagement.intro_booking_id.slice(0, 8).toUpperCase() },
      ...(billing.contact ? [{ name: "Ansprechpartner", value: billing.contact.slice(0, 140) }] : []),
    ];
    const draft = await stripeRequest<StripeInvoice>(
      "POST",
      "/invoices",
      {
        customer: customerId,
        collection_method: "send_invoice",
        days_until_due: PLACEMENT_TERMS.paymentDays,
        currency: "eur",
        auto_advance: false,
        pending_invoice_items_behavior: "exclude",
        default_tax_rates: [tax],
        custom_fields: customFields,
        footer:
          `Zahlbar innerhalb von ${PLACEMENT_TERMS.paymentDays} Tagen ohne Abzug. ` +
          "Vermittlungshonorar nach den Vermittlungsbedingungen von XPORTAL (x-portal.eu/vermittlungsbedingungen).",
        metadata,
      },
      { idempotencyKey: `xportal-placement-invoice-${engagement.id}` },
    );
    invoiceId = draft.id;
    await save({ stripe_invoice_id: invoiceId });
  }

  let invoice = await stripeRequest<StripeInvoice>("GET", `/invoices/${invoiceId}`);
  if (invoice.status === "draft" && invoice.subtotal === 0) {
    await stripeRequest(
      "POST",
      "/invoiceitems",
      {
        customer: customerId,
        invoice: invoiceId,
        amount: engagement.fee_minor,
        currency: "eur",
        description: placementInvoiceLine({
          freelancerName: profileRow?.display_name ?? "Freelancer",
          freelancerRole: profileRow?.role_title ?? "Freelancer",
          projectTitle,
          dayRateMinor: engagement.day_rate_minor,
          projectDays: engagement.project_days,
          termsVersion,
        }),
        metadata,
      },
      { idempotencyKey: `xportal-placement-item-${engagement.id}` },
    );
    invoice = await stripeRequest<StripeInvoice>("GET", `/invoices/${invoiceId}`);
  }
  if (invoice.subtotal !== engagement.fee_minor) {
    throw new Response(
      `Die Stripe-Rechnung ${invoiceId} weicht vom Honorar ab und wurde nicht verschickt. Bitte in Stripe prüfen.`,
      { status: 409 },
    );
  }
  if (invoice.status === "draft") {
    invoice = await stripeRequest<StripeInvoice>(
      "POST",
      `/invoices/${invoiceId}/finalize`,
      { auto_advance: false },
      { idempotencyKey: `xportal-placement-finalize-${engagement.id}` },
    );
  }
  if (invoice.status === "open") {
    invoice = await stripeRequest<StripeInvoice>("POST", `/invoices/${invoiceId}/send`);
  }

  const dueOn = invoice.due_date ? new Date(invoice.due_date * 1000).toISOString().slice(0, 10) : null;
  const now = new Date().toISOString();
  const { data: updated, error: statusError } = await admin
    .from("engagements")
    .update({
      fee_status: invoice.status === "paid" ? "paid" : "invoiced",
      invoice_reference: invoice.number ?? invoiceId,
      invoiced_at: now,
      ...(invoice.status === "paid" ? { paid_at: now } : {}),
      invoice_url: invoice.hosted_invoice_url,
      invoice_pdf_url: invoice.invoice_pdf,
      invoice_due_on: dueOn,
    })
    .eq("id", engagement.id)
    .eq("fee_status", "open")
    .select("id")
    .maybeSingle();
  if (statusError) throw statusError;
  if (!updated) throw new Response("Der Rechnungsstand hat sich inzwischen geändert.", { status: 409 });

  return {
    number: invoice.number,
    totalMinor: invoice.total,
    feeMinor: engagement.fee_minor,
    dueOn,
    clientUserId: engagement.owner_user_id,
  };
}

/**
 * `invoice.paid` für eine Vermittlungsrechnung. Liefert null, wenn die
 * Rechnung keiner Beauftragung gehört oder schon als bezahlt verbucht ist —
 * Stripe stellt Ereignisse mitunter mehrfach zu.
 */
export async function recordPlacementInvoicePaid(stripeInvoiceId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("engagements")
    .update({ fee_status: "paid", paid_at: new Date().toISOString() })
    .eq("stripe_invoice_id", stripeInvoiceId)
    .in("fee_status", ["open", "invoiced"])
    .select("intro_booking_id,owner_user_id,fee_minor")
    .maybeSingle();
  if (error) throw error;
  const row = data as { intro_booking_id: string | null; owner_user_id: string; fee_minor: number | null } | null;
  if (!row) return null;
  return { introId: row.intro_booking_id, clientUserId: row.owner_user_id, feeMinor: row.fee_minor ?? 0 };
}
