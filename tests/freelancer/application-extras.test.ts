import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replaceProjects: vi.fn(), admin: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: () => mocks.admin }));
vi.mock("@/lib/data/freelancer-projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/freelancer-projects")>()),
  replaceProjects: mocks.replaceProjects,
}));

import {
  decisionDefaultsFromApplication,
  FreelancerApplicationInputSchema,
  applicationInsertFromInput,
  PublishDecisionSchema,
  storedApplicationProjects,
  type ApplicationRow,
} from "@/lib/freelancer/application";
import { applicationPreviewProfile } from "@/lib/freelancer/application-preview";
import { publishApplication, setApplicationStatus } from "@/lib/freelancer/applications-data";
import {
  APPLICATION_PHOTO_PATH_PATTERN,
  AVATAR_OBJECT_PATH_PATTERN,
  avatarMimeTypeFromPath,
} from "@/lib/freelancer/avatar-limits";
import {
  mintApplicationPhotoPath,
  signApplicationPhotoPath,
  verifyApplicationPhotoPath,
} from "@/lib/freelancer/avatar-storage";

const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const PHOTO = "incoming/33333333-3333-4333-8333-333333333333/avatar-0123456789abcdef0123456789abcdef.webp";

const project = {
  title: "Service-Agent für Schadenmeldungen",
  industry: "Versicherungen",
  role: "Lead Developer",
  startedOn: "2024-03",
  ongoing: true,
  technologies: ["LangChain", "Python"],
  outcome: "Durchlaufzeit je Meldung halbiert.",
  isPublic: true,
};

function applicationPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Kim Beispiel",
    contactEmail: "kim@example.com",
    roleTitle: "AI Engineer",
    experienceSummary: "Baut seit sechs Jahren Agenten und Suchsysteme für Versicherer und Händler.",
    skills: ["Python"],
    languages: ["Deutsch"],
    workModes: ["remote"],
    dayRate: "900",
    consent: true,
    ...overrides,
  };
}

function decisionPayload(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Kim Beispiel",
    roleTitle: "AI Engineer",
    experienceSummary: "Agenten und Suchsysteme.",
    skills: ["Python"],
    languages: ["Deutsch"],
    workModes: ["remote"],
    dayRate: "900",
    availabilityStatus: "available",
    ...overrides,
  };
}

describe("projects and photo in the application", () => {
  it("stores projects as the applicant's claims, never as checked", () => {
    const input = FreelancerApplicationInputSchema.parse(
      applicationPayload({ projects: [{ ...project, verified: true, source: "operator" }] }),
    );
    const insert = applicationInsertFromInput(input, { submittedByUserId: "user-1", consentAt: "2026-10-02T10:00:00Z" });
    expect(insert.reference_projects).toEqual([
      expect.objectContaining({ title: project.title, verified: false, source: "application", sourceUrl: null, ongoing: true }),
    ]);
    expect(insert.photo_storage_path).toBeNull();
  });

  it("takes a photo only as a signed upload", () => {
    const token = signApplicationPhotoPath(PHOTO);
    const input = FreelancerApplicationInputSchema.parse(applicationPayload({ photo: { storagePath: PHOTO, token } }));
    expect(applicationInsertFromInput(input, { submittedByUserId: null, consentAt: "x" }).photo_storage_path).toBe(PHOTO);
    expect(FreelancerApplicationInputSchema.safeParse(applicationPayload({ photo: { storagePath: PHOTO, token: "nope" } })).success).toBe(false);
    expect(FreelancerApplicationInputSchema.safeParse(applicationPayload({ projects: Array(9).fill(project) })).success).toBe(false);
  });

  it("reads stored projects defensively", () => {
    expect(storedApplicationProjects(undefined)).toEqual([]);
    expect(storedApplicationProjects([{ title: "x" }])).toEqual([]);
    expect(storedApplicationProjects([{ ...project, verified: true }])[0]).toMatchObject({ verified: false, source: "application" });
  });

  it("lets the reviewer choose projects by position and keeps the photo opt-in", () => {
    const decision = PublishDecisionSchema.parse(
      decisionPayload({ projects: [{ index: 1, verified: true }, { index: 0 }, { index: 1, verified: false }] }),
    );
    expect(decision.projects).toEqual([
      { index: 1, verified: false },
      { index: 0, verified: false },
    ]);
    expect(decision.usePhoto).toBe(false);
    expect(PublishDecisionSchema.safeParse(decisionPayload({ projects: [{ index: 8 }] })).success).toBe(false);
    expect(PublishDecisionSchema.safeParse(decisionPayload({ projects: [{ index: 0, title: "eingeschmuggelt" }] })).success).toBe(false);
  });

  it("preselects every submitted project unchecked and the photo when there is one", () => {
    const row = { full_name: "Kim Beispiel", reference_projects: [project, project], photo_storage_path: PHOTO } as unknown as ApplicationRow;
    expect(decisionDefaultsFromApplication(row)).toMatchObject({
      projects: [
        { index: 0, verified: false },
        { index: 1, verified: false },
      ],
      usePhoto: true,
    });
    expect(decisionDefaultsFromApplication({ full_name: "Kim" } as unknown as ApplicationRow)).toMatchObject({ projects: [], usePhoto: false });
  });
});

describe("application photo paths", () => {
  it("mints paths the image route never serves", () => {
    const path = mintApplicationPhotoPath("image/png");
    expect(path).toMatch(APPLICATION_PHOTO_PATH_PATTERN);
    expect(path).not.toMatch(AVATAR_OBJECT_PATH_PATTERN);
    expect(avatarMimeTypeFromPath(path)).toBe("image/png");
  });

  it("accepts only the server's own signature", () => {
    expect(verifyApplicationPhotoPath(PHOTO, signApplicationPhotoPath(PHOTO))).toBe(true);
    const other = PHOTO.replace("0123", "4567");
    expect(verifyApplicationPhotoPath(other, signApplicationPhotoPath(PHOTO))).toBe(false);
    const profilePath = `${PROFILE_ID}/avatar-0123456789abcdef0123456789abcdef.webp`;
    expect(verifyApplicationPhotoPath(profilePath, signApplicationPhotoPath(profilePath))).toBe(false);
  });
});

describe("live preview", () => {
  it("shows the photo and the first project meant to be shown", () => {
    const valid = storedApplicationProjects([{ ...project, isPublic: false, title: "Intern" }, project]);
    const preview = applicationPreviewProfile(
      {
        fullName: "Kim",
        roleTitle: "AI Engineer",
        skills: [],
        locationText: "",
        workModes: ["remote"],
        hourlyRate: "",
        dayRate: "",
        currency: "EUR",
        availabilityStatus: "available",
        availabilityFrom: "",
        bookingUrl: "",
        seeking: "projects",
        avatarUrl: "data:image/png;base64,AAAA",
        projects: [...valid, { ...valid[1]!, title: "x " }],
      },
      new Date("2026-10-02T10:00:00Z"),
    );
    expect(preview.avatarUrl).toBe("data:image/png;base64,AAAA");
    expect(preview.highlight).toMatchObject({ title: project.title, meta: "Versicherungen · seit 03/2024" });
    expect(preview.projectCount).toBe(1);
  });
});

type Call = { table: string; op: string; payload?: Record<string, unknown> };

function fakeAdmin() {
  const calls: Call[] = [];
  const storage = {
    download: vi.fn(async () => ({ data: new Blob(["RIFF0000WEBP"]), error: null })),
    upload: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
  };
  const admin = {
    from(table: string) {
      const call: Call = { table, op: "select" };
      const result = () =>
        call.op === "update" && table === "freelancer_applications" && call.payload?.status === "approved"
          ? { data: [{ id: APPLICATION_ID }], error: null }
          : { data: null, error: null };
      const builder: Record<string, unknown> = {
        insert: (payload: Record<string, unknown>) => Object.assign(call, { op: "insert", payload }) && builder,
        update: (payload: Record<string, unknown>) => Object.assign(call, { op: "update", payload }) && builder,
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        single: async () => {
          calls.push(call);
          return { data: { id: PROFILE_ID, slug: "kim-beispiel" }, error: null };
        },
        then: (resolve: (value: unknown) => unknown) => {
          calls.push(call);
          return Promise.resolve(result()).then(resolve);
        },
      };
      return builder;
    },
    storage: { from: () => storage },
  };
  return { admin, calls, storage };
}

const application = {
  id: APPLICATION_ID,
  submitted_by_user_id: "user-1",
  published_profile_id: null,
  cv_storage_path: null,
  reference_projects: [project, { ...project, title: "Wissenssuche im Handel" }],
  photo_storage_path: PHOTO,
} as unknown as ApplicationRow;

describe("publishing an application with projects and photo", () => {
  beforeEach(() => {
    mocks.replaceProjects.mockReset().mockResolvedValue(1);
  });

  it("hands over the chosen projects with the reviewer's check and moves the photo", async () => {
    const { admin, calls, storage } = fakeAdmin();
    mocks.admin = admin;
    const result = await publishApplication({
      application,
      decision: PublishDecisionSchema.parse(decisionPayload({ projects: [{ index: 1, verified: true }], usePhoto: true })),
      reviewerUserId: "admin-1",
    });

    expect(mocks.replaceProjects).toHaveBeenCalledWith(
      admin,
      PROFILE_ID,
      [expect.objectContaining({ title: "Wissenssuche im Handel", verified: true, source: "application" })],
      "admin-1",
    );
    const [target, , options] = storage.upload.mock.calls[0] as unknown as [string, Blob, { contentType: string }];
    expect(target).toMatch(new RegExp(`^${PROFILE_ID}/avatar-[0-9a-f]{32}\\.webp$`));
    expect(options.contentType).toBe("image/webp");
    expect(calls).toContainEqual({ table: "freelancer_profiles", op: "update", payload: { avatar_path: target } });
    expect(storage.remove).toHaveBeenCalledWith([PHOTO]);
    expect(result).toMatchObject({ projectsChosen: 1, projectsTransferred: 1, photoSubmitted: true, photoTransferred: true });
  });

  it("deletes an unused photo and takes no project unless chosen", async () => {
    const { admin, calls, storage } = fakeAdmin();
    mocks.admin = admin;
    const result = await publishApplication({
      application,
      decision: PublishDecisionSchema.parse(decisionPayload()),
      reviewerUserId: "admin-1",
    });
    expect(mocks.replaceProjects).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith([PHOTO]);
    expect(calls).toContainEqual({ table: "freelancer_applications", op: "update", payload: { photo_storage_path: null } });
    expect(result).toMatchObject({ projectsTransferred: 0, photoTransferred: false });
  });

  it("keeps the profile live when the project handover fails", async () => {
    const { admin } = fakeAdmin();
    mocks.admin = admin;
    mocks.replaceProjects.mockRejectedValueOnce(new Error("timeout"));
    const result = await publishApplication({
      application,
      decision: PublishDecisionSchema.parse(decisionPayload({ projects: [{ index: 0 }] })),
      reviewerUserId: "admin-1",
    });
    expect(result).toMatchObject({ profileId: PROFILE_ID, projectsChosen: 1, projectsTransferred: 0 });
  });
});

describe("rejecting an application", () => {
  it("deletes its photo, but not when it only goes back to review", async () => {
    const { admin, storage } = fakeAdmin();
    mocks.admin = admin;
    await setApplicationStatus({ applicationId: APPLICATION_ID, status: "in_review", reviewerUserId: "admin-1", reviewNotes: null, photoStoragePath: PHOTO });
    expect(storage.remove).not.toHaveBeenCalled();
    await setApplicationStatus({ applicationId: APPLICATION_ID, status: "rejected", reviewerUserId: "admin-1", reviewNotes: null, photoStoragePath: PHOTO });
    expect(storage.remove).toHaveBeenCalledWith([PHOTO]);
  });
});
