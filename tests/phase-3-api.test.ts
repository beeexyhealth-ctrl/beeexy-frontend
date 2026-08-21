import { afterEach, describe, expect, it, vi } from "vitest";
import { BeeexyApiClient } from "@/lib/beeexy-api/api-client";
import { BeeexyPhase3Api } from "@/lib/beeexy-api/phase-3-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import type { CreateManagedPatientRequest, PatientDetail } from "@/lib/beeexy-api/contracts";
import type { BeeexySession, SessionStore } from "@/lib/beeexy-api/session-storage";

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const baseUrl = "http://localhost:5105";
const profileId = "20000000-0000-4000-8000-000000000002";
const relationshipId = "30000000-0000-4000-8000-000000000003";

const session: BeeexySession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
  account: { accountId: "10000000-0000-4000-8000-000000000001", profileId, beeexyId: "BXY-PRIMARY" },
};

const detail: PatientDetail = {
  profileId,
  beeexyId: "BXY-PRIMARY",
  firstName: "Jesús",
  lastName: "Arias",
  dateOfBirth: "1990-04-18",
  sexAssignedAtBirth: "Male",
  state: "FL",
  version: 3,
};

const createRequest: CreateManagedPatientRequest = {
  relationshipType: "LegalGuardian",
  attestationVersion: "approved-v1",
  attestationAccepted: true,
  patient: {
    firstName: "María",
    lastName: "Arias",
    dateOfBirth: "2012-05-12",
    sexAssignedAtBirth: "Female",
    state: "NY",
  },
};

class MemoryStore implements SessionStore {
  read() { return session; }
  write() {}
  clear() {}
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function createApi(fetcher: TestFetch) {
  return new BeeexyPhase3Api(new BeeexyApiClient(baseUrl, new MemoryStore(), fetcher));
}

afterEach(() => vi.restoreAllMocks());

describe("Beeexy Phase 3 API contract", () => {
  it("lists only the backend-authoritative accessible-patient response", async () => {
    const response = { patients: [{ profileId, beeexyId: "BXY-PRIMARY", firstName: "Jesús", lastName: "Arias", accessType: "Primary", relationship: null }] };
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse(response));

    await expect(createApi(fetcher).listAccessiblePatients()).resolves.toEqual(response);

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/patients`);
    expect(fetcher.mock.calls[0][1]?.method).toBe("GET");
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("creates a managed patient with exactly the documented nested payload", async () => {
    const response = {
      relationship: { id: relationshipId, type: "LegalGuardian", status: "Active", attestationVersion: "approved-v1", attestedAt: "2026-08-21T12:00:00Z" },
      patient: { profileId, beeexyId: "BXY-MANAGED", ...createRequest.patient, version: 1 },
    };
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse(response, 201));

    await expect(createApi(fetcher).createManagedPatient(createRequest)).resolves.toEqual(response);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/care-relationships`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(createRequest);
    expect(Object.keys(JSON.parse(String(init?.body)))).toEqual(["relationshipType", "attestationVersion", "attestationAccepted", "patient"]);
  });

  it("lists Active and Revoked relationship history separately from patients", async () => {
    const response = { relationships: [{ id: relationshipId, subject: { profileId, beeexyId: "BXY-MANAGED", firstName: "María", lastName: "Arias" }, type: "Child", status: "Revoked", attestationVersion: "v1", attestedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", revokedAt: "2026-02-01T00:00:00Z" }] };
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse(response));

    await expect(createApi(fetcher).listCareRelationships()).resolves.toEqual(response);
    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/care-relationships`);
  });

  it("loads patient detail by profileId rather than Beeexy ID", async () => {
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse(detail));

    await expect(createApi(fetcher).getPatient(profileId)).resolves.toEqual(detail);
    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/patients/${profileId}`);
  });

  it("sends the current PatientProfile version on PATCH and trusts the returned version", async () => {
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse({ ...detail, firstName: "Jesus", version: 4 }));

    const result = await createApi(fetcher).updatePatient(profileId, { firstName: "Jesus", version: 3 });

    expect(result.version).toBe(4);
    expect(fetcher.mock.calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ firstName: "Jesus", version: 3 });
  });

  it("does not manufacture a version increment for a same-value update", async () => {
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse(detail));

    await expect(createApi(fetcher).updatePatient(profileId, { state: "FL", version: 3 })).resolves.toMatchObject({ version: 3 });
  });

  it("surfaces 409 so the caller can refetch instead of replaying stale edits", async () => {
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse({ status: 409, title: "Conflict" }, 409));

    const error = await createApi(fetcher).updatePatient(profileId, { state: "NY", version: 2 }).catch((caught) => caught);

    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error.status).toBe(409);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("treats concealed patient 404 as a generic unavailable resource", async () => {
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse({ status: 404, detail: "internal authorization reason" }, 404));

    const error = await createApi(fetcher).getPatient(profileId).catch((caught) => caught);

    expect(error.status).toBe(404);
    expect(error.message).toMatch(/unavailable/i);
    expect(error.message).not.toContain("authorization");
  });

  it("revokes by relationship ID with DELETE and no request body", async () => {
    const fetcher = vi.fn<TestFetch>(async () => new Response(null, { status: 204 }));

    await expect(createApi(fetcher).revokeCareRelationship(relationshipId)).resolves.toBeUndefined();

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/care-relationships/${relationshipId}`);
    expect(fetcher.mock.calls[0][1]?.method).toBe("DELETE");
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });
});
