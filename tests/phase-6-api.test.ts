import { describe, expect, it, vi } from "vitest";
import { BeeexyApiClient } from "@/lib/beeexy-api/api-client";
import type { FhirExportMetadata } from "@/lib/beeexy-api/contracts";
import { BeeexyPhase6Api } from "@/lib/beeexy-api/phase-6-api";
import type { BeeexySession, SessionStore } from "@/lib/beeexy-api/session-storage";

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const baseUrl = "http://localhost:5105";
const patientId = "10000000-0000-0000-0000-000000000001";
const eventId = "60000000-0000-0000-0000-000000000006";
const exportId = "90000000-0000-0000-0000-000000000009";
const idempotencyKey = "80000000-0000-0000-0000-000000000008";

const session: BeeexySession = {
  accessToken: "phase-6-access",
  refreshToken: "phase-6-refresh",
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
  account: { accountId: "account-1", profileId: patientId, beeexyId: "BXY-1" },
};

const metadata: FhirExportMetadata = {
  id: exportId,
  status: "Validated",
  fhirVersion: "4.0.1",
  mappingVersion: "beeexy-fhir-r4-base-mvp-v1",
  createdAt: "2026-08-24T20:30:00Z",
  generatedAt: "2026-08-24T20:30:00.010Z",
  validationCompletedAt: "2026-08-24T20:30:00.020Z",
  validation: { outcome: "Passed", errorCount: 0, warningCount: 0, completedAt: "2026-08-24T20:30:00.020Z" },
};

class MemoryStore implements SessionStore {
  constructor(private value: BeeexySession | null = session) {}
  clear() { this.value = null; }
  read() { return this.value; }
  write(next: BeeexySession) { this.value = next; }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function createApi(fetcher: TestFetch) {
  return new BeeexyPhase6Api(new BeeexyApiClient(baseUrl, new MemoryStore(), fetcher));
}

describe("Beeexy Phase 6 API contract", () => {
  it.each([200, 201])("creates an export with the exact body and accepts %s", async (status) => {
    const fetcher = vi.fn<TestFetch>(async () => json(metadata, status));
    const request = { sourceClinicalHistoryEventId: eventId, idempotencyKey };

    await expect(createApi(fetcher).createFhirExport(patientId, request)).resolves.toEqual(metadata);

    const [url, init] = fetcher.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(url).toBe(`${baseUrl}/api/v1/patients/${patientId}/fhir-exports`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(Object.keys(JSON.parse(String(init?.body)))).toEqual(["sourceClinicalHistoryEventId", "idempotencyKey"]);
    expect(headers.get("Authorization")).toBe("Bearer phase-6-access");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBeNull();
  });

  it("reads metadata from the exact export route through the authenticated client", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(metadata));

    await expect(createApi(fetcher).getFhirExport(exportId)).resolves.toEqual(metadata);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/fhir-exports/${exportId}`);
    expect(init?.method).toBe("GET");
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer phase-6-access");
    expect((init?.headers as Headers).get("Accept")).toBe("application/json");
  });

  it("downloads exact Blob content without JSON parsing or reconstruction", async () => {
    const bytes = new Uint8Array([123, 34, 114, 101, 115, 111, 117, 114, 99, 101, 84, 121, 112, 101, 34, 58, 34, 66, 117, 110, 100, 108, 101, 34, 125]);
    const response = new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/fhir+json",
        "content-disposition": `attachment; filename=beeexy-fhir-export-${exportId}.json`,
      },
    });
    const jsonSpy = vi.spyOn(response, "json");
    const fetcher = vi.fn<TestFetch>(async () => response);

    const result = await createApi(fetcher).downloadFhirExport(exportId);

    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes);
    expect(result.fileName).toBe(`beeexy-fhir-export-${exportId}.json`);
    expect(jsonSpy).not.toHaveBeenCalled();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/fhir-exports/${exportId}/content`);
    expect(init?.method).toBe("GET");
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer phase-6-access");
    expect((init?.headers as Headers).get("Accept")).toBe("application/fhir+json");
  });

  it("uses the authenticated client's coordinated 401 refresh for content", async () => {
    const refreshedSession: BeeexySession = {
      ...session,
      accessToken: "phase-6-refreshed-access",
      refreshToken: "phase-6-refreshed-refresh",
    };
    const fetcher = vi.fn<TestFetch>(async (input) => {
      if (String(input).endsWith("/api/v1/auth/refresh")) return json(refreshedSession);
      if (fetcher.mock.calls.filter(([url]) => String(url).endsWith(`/fhir-exports/${exportId}/content`)).length === 1) {
        return json({ status: 401 }, 401);
      }
      return new Response("{}", { status: 200, headers: { "content-type": "application/fhir+json" } });
    });

    await expect(createApi(fetcher).downloadFhirExport(exportId)).resolves.toMatchObject({
      fileName: `beeexy-fhir-export-${exportId}.json`,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    const retriedHeaders = fetcher.mock.calls[2][1]?.headers as Headers;
    expect(retriedHeaders.get("Authorization")).toBe("Bearer phase-6-refreshed-access");
  });

  it("uses a privacy-safe fallback when Content-Disposition is absent or unsafe", async () => {
    const fetcher = vi.fn<TestFetch>(async () => new Response("{}", {
      status: 200,
      headers: { "content-type": "application/fhir+json", "content-disposition": "attachment; filename=../../patient-name.json" },
    }));

    const result = await createApi(fetcher).downloadFhirExport(exportId.toUpperCase());

    expect(result.fileName).toBe(`beeexy-fhir-export-${exportId}.json`);
  });
});
