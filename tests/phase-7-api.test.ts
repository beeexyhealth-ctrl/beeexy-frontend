import { describe, expect, it, vi } from "vitest";
import { BeeexyApiClient } from "@/lib/beeexy-api/api-client";
import { BeeexyPhase7Api } from "@/lib/beeexy-api/phase-7-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import type { SessionStore } from "@/lib/beeexy-api/session-storage";

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const baseUrl = "http://localhost:5105";

class MemoryStore implements SessionStore {
  clear() {}
  read() { return null; }
  write() {}
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function createApi(fetcher: TestFetch) {
  return new BeeexyPhase7Api(new BeeexyApiClient(baseUrl, new MemoryStore(), fetcher));
}

describe("Beeexy Phase 7 API contract", () => {
  it("lists clinics through the exact anonymous GET route", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json({ items: [], nextCursor: null }));
    await expect(createApi(fetcher).listClinics()).resolves.toEqual({ items: [], nextCursor: null });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/clinics`);
    expect(init?.method).toBe("GET");
    expect((init?.headers as Headers).get("Accept")).toBe("application/json");
    expect((init?.headers as Headers).get("Authorization")).toBeNull();
  });

  it("gets clinic detail using the encoded route ID", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json({ clinicId: "clinic/id", code: "demo", name: "Demo", locations: [] }));
    await createApi(fetcher).getClinic("clinic/id");
    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/clinics/clinic%2Fid`);
  });

  it("searches doctors with exact query names, one encoding pass, and no unset values", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json({ items: [], nextCursor: null }));
    await createApi(fetcher).searchDoctors({
      specialtyCode: "demo-specialty-general",
      languageCode: undefined,
      locality: "Demo Harbor",
      administrativeArea: "Synthetic Demo Region",
      country: "",
      insurancePlanCode: "demo-plan-blue",
      pageSize: 20,
      cursor: "opaque_token-1",
    });

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/doctors?specialtyCode=demo-specialty-general&locality=Demo+Harbor&administrativeArea=Synthetic+Demo+Region&insurancePlanCode=demo-plan-blue&pageSize=20&cursor=opaque_token-1`);
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get("Authorization")).toBeNull();
  });

  it("serializes every documented clinic filter and pagination field", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json({ items: [], nextCursor: null }));
    await createApi(fetcher).listClinics({ code: "demo-clinic", locality: "Demo Central", administrativeArea: "Demo Region", country: "Demo Country", pageSize: 100, cursor: "opaque" });
    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/clinics?code=demo-clinic&locality=Demo+Central&administrativeArea=Demo+Region&country=Demo+Country&pageSize=100&cursor=opaque`);
  });

  it("gets doctor detail using the exact route", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json({ doctorId: "doctor-id", code: "demo", displayName: "Demo", specialties: [], languages: [], affiliations: [], storedInsuranceParticipations: [], credentials: [] }));
    await createApi(fetcher).getDoctor("doctor-id");
    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/doctors/doctor-id`);
  });

  it("passes AbortSignal through public directory requests", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json({ items: [], nextCursor: null }));
    const controller = new AbortController();
    await createApi(fetcher).searchDoctors({}, controller.signal);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("maps Phase 7 Problem Details and preserves correlation ID", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json({ title: "Request validation failed.", status: 422, errorCode: "doctor_directory.cursor_invalid", correlationId: "phase-7-correlation" }, 422));
    const error = await createApi(fetcher).searchDoctors({ cursor: "tampered" }).catch((reason) => reason);
    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error).toMatchObject({ status: 422, correlationId: "phase-7-correlation", problem: { errorCode: "doctor_directory.cursor_invalid" } });
  });
});
