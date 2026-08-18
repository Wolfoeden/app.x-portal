import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  attachFreelancerCvAccess,
  fetchDownloadableCvDocument,
  fetchDownloadableCvProfileIds,
  isSafeFreelancerCvStorageObject,
  safeCvDownloadFilename,
} from "@/lib/data/freelancer-cvs";

function listClient(rows: Array<{ profile_id: string }> = []) {
  const eq = vi.fn().mockResolvedValue({ data: rows, error: null });
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    eq,
  };
  return {
    client: { from: vi.fn(() => query) },
    query,
  };
}

describe("freelancer CV data access", () => {
  const document = {
    profileId: "10000000-0000-4000-8000-000000000001",
    storageBucket: "freelancer-cvs",
    storagePath: "10000000-0000-4000-8000-000000000001/cv-v1.pdf",
    originalFilename: "CV.pdf",
    mimeType: "application/pdf" as const,
    byteSize: 1_000,
    version: 1,
  };

  it("accepts only live Storage metadata with a cache TTL no longer than the URL", () => {
    const safeObject = {
      bucketId: "freelancer-cvs",
      contentType: "application/pdf",
      size: 1_000,
      cacheControl: "max-age=60",
    };

    expect(isSafeFreelancerCvStorageObject(safeObject, document)).toBe(true);
    expect(
      isSafeFreelancerCvStorageObject(
        { ...safeObject, cacheControl: "max-age=3600" },
        document,
      ),
    ).toBe(false);
    expect(
      isSafeFreelancerCvStorageObject(
        { ...safeObject, contentType: "text/plain" },
        document,
      ),
    ).toBe(false);
    expect(
      isSafeFreelancerCvStorageObject(
        { ...safeObject, size: 999 },
        document,
      ),
    ).toBe(false);
  });

  it("never queries or reveals CV existence to an anonymous session", async () => {
    const { client } = listClient([
      { profile_id: "10000000-0000-4000-8000-000000000001" },
    ]);

    const result = await attachFreelancerCvAccess(
      client as never,
      [
        { id: "primary", recommendationRole: "primary" as const },
        { id: "alternative", recommendationRole: "alternative" as const },
      ],
      true,
    );

    expect(result.map((profile) => profile.cvAccess)).toEqual([
      "login_required",
      "login_required",
    ]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("does not query CV metadata for a non-actionable project state", async () => {
    const accountClient = listClient([{ profile_id: "primary" }]);
    const guestClient = listClient([{ profile_id: "primary" }]);

    const accountResult = await attachFreelancerCvAccess(
      accountClient.client as never,
      [{ id: "primary", recommendationRole: "primary" as const }],
      false,
      false,
    );
    const guestResult = await attachFreelancerCvAccess(
      guestClient.client as never,
      [{ id: "primary", recommendationRole: "primary" as const }],
      true,
      false,
    );

    expect(accountResult[0]?.cvAccess).toBe("forbidden");
    expect(guestResult[0]?.cvAccess).toBe("login_required");
    expect(accountClient.client.from).not.toHaveBeenCalled();
    expect(guestClient.client.from).not.toHaveBeenCalled();
  });

  it("keeps partial and unclassified profiles forbidden and out of the query", async () => {
    const { client, query } = listClient();

    const result = await attachFreelancerCvAccess(
      client as never,
      [
        { id: "primary", recommendationRole: "primary" as const },
        { id: "partial", recommendationRole: "partial" as const },
        { id: "legacy", recommendationRole: null },
        { id: "undefined" },
      ],
      false,
    );

    expect(query.in).toHaveBeenCalledWith("profile_id", ["primary"]);
    expect(result.map((profile) => profile.cvAccess)).toEqual([
      "missing",
      "forbidden",
      "forbidden",
      "forbidden",
    ]);
  });

  it("distinguishes available and missing CVs for account recommendations", async () => {
    const { client } = listClient([{ profile_id: "available" }]);

    const result = await attachFreelancerCvAccess(
      client as never,
      [
        { id: "available", recommendationRole: "primary" as const },
        { id: "missing", recommendationRole: "alternative" as const },
      ],
      false,
    );

    expect(result.map((profile) => profile.cvAccess)).toEqual([
      "available",
      "missing",
    ]);
  });

  it("fails closed without breaking the core response when metadata is unavailable", async () => {
    const { client, query } = listClient();
    query.eq.mockResolvedValueOnce({ data: null, error: new Error("database unavailable") });

    const result = await attachFreelancerCvAccess(
      client as never,
      [{ id: "primary", recommendationRole: "primary" as const }],
      false,
    );

    expect(result[0]?.cvAccess).toBe("forbidden");
  });

  it("does not query CV metadata for an empty profile set", async () => {
    const { client } = listClient();

    const result = await fetchDownloadableCvProfileIds(client as never, []);

    expect(result.size).toBe(0);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns only the account-visible availability set without document metadata", async () => {
    const { client, query } = listClient([
      { profile_id: "10000000-0000-4000-8000-000000000001" },
    ]);

    const result = await fetchDownloadableCvProfileIds(client as never, [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000001",
    ]);

    expect([...result]).toEqual(["10000000-0000-4000-8000-000000000001"]);
    expect(query.select).toHaveBeenCalledWith("profile_id");
    expect(query.in).toHaveBeenCalledWith("profile_id", [
      "10000000-0000-4000-8000-000000000001",
    ]);
    expect(query.eq).toHaveBeenCalledWith("is_downloadable", true);
  });

  it("rejects inconsistent stored CV metadata", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        profile_id: "10000000-0000-4000-8000-000000000001",
        storage_bucket: "public-files",
        storage_path: "cv.pdf",
        original_filename: "cv.pdf",
        mime_type: "application/pdf",
        byte_size: 100,
        version: 1,
        is_downloadable: true,
      },
      error: null,
    });
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle,
    };
    const client = { from: vi.fn(() => query) };

    await expect(
      fetchDownloadableCvDocument(client as never, "10000000-0000-4000-8000-000000000001"),
    ).rejects.toThrow("invalid_freelancer_cv_metadata");
  });

  it("accepts metadata only when its object path belongs to the profile version", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        profile_id: "10000000-0000-4000-8000-000000000001",
        storage_bucket: "freelancer-cvs",
        storage_path: "10000000-0000-4000-8000-000000000001/cv-v2.pdf",
        original_filename: "cv.pdf",
        mime_type: "application/pdf",
        byte_size: 100,
        version: 1,
        is_downloadable: true,
      },
      error: null,
    });
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle,
    };
    const client = { from: vi.fn(() => query) };

    await expect(
      fetchDownloadableCvDocument(client as never, "10000000-0000-4000-8000-000000000001"),
    ).rejects.toThrow("invalid_freelancer_cv_metadata");
  });

  it("sanitizes a stored filename before it enters a download header", () => {
    expect(
      safeCvDownloadFilename(
        "../../Roman\r\nX-Test: injected.pdf",
        "10000000-0000-4000-8000-000000000001",
      ),
    ).toBe("Roman--X-Test injected.pdf");
  });
});
