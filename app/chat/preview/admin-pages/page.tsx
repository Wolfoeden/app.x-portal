import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminNav } from "@/app/chat/admin/AdminNav";
import {
  ADMIN_PREVIEW_VIEWS,
  AdminPagesPreview,
  type AdminPreviewView,
} from "@/components/admin/AdminPagesPreview";

export const metadata: Metadata = {
  title: "Admin-Seiten Vorschau | XPORTAL",
  robots: { index: false, follow: false },
};

function isPreviewView(value: string | undefined): value is AdminPreviewView {
  return Boolean(
    value && (ADMIN_PREVIEW_VIEWS as readonly string[]).includes(value),
  );
}

export default async function AdminPagesPreviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.XPORTAL_LOCAL_PREVIEW !== "1"
  ) {
    notFound();
  }

  const params = (await searchParams) ?? {};
  const requestedView = Array.isArray(params.view)
    ? params.view[0]
    : params.view;
  const view: AdminPreviewView = isPreviewView(requestedView)
    ? requestedView
    : "users";

  return (
    <div data-admin-surface>
      <AdminNav
        activeHref={`/chat/admin/${view}`}
        disablePrefetch
        previewMode
      />
      <AdminPagesPreview view={view} />
    </div>
  );
}
