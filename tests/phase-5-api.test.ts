import { describe, expect, it, vi } from "vitest";
import { BeeexyApiClient } from "@/lib/beeexy-api/api-client";
import type { ClinicalHistoryEventDetail, ClinicalHistoryPage } from "@/lib/beeexy-api/contracts";
import { BeeexyPhase5Api } from "@/lib/beeexy-api/phase-5-api";
import type { BeeexySession, SessionStore } from "@/lib/beeexy-api/session-storage";

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const baseUrl = "http://localhost:5105";
const patientId = "10000000-0000-0000-0000-000000000001";
const eventId = "60000000-0000-0000-0000-000000000006";
const episodeId = "50000000-0000-0000-0000-000000000005";

const session: BeeexySession = {
  accessToken: "phase-5-access",
  refreshToken: "phase-5-refresh",
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
  account: { accountId: "account-1", profileId: patientId, beeexyId: "BXY-1" },
};

const source = {
  type: "PRE_TRIAGE_EPISODE" as const,
  id: episodeId,
  questionnaireVersionId: "30000000-0000-0000-0000-000000000003",
  clinicalRuleSetVersionId: "40000000-0000-0000-0000-000000000004",
};

const item = {
  eventId,
  eventType: "COMPLETED_PRE_TRIAGE" as const,
  occurredAt: "2026-08-24T14:30:00Z",
  recordedAt: "2026-08-24T14:30:00Z",
  source,
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
  return new BeeexyPhase5Api(new BeeexyApiClient(baseUrl, new MemoryStore(), fetcher));
}

describe("Beeexy Phase 5 API contract", () => {
  it("lists the selected patient with the exact opaque cursor, page size, filter, and Bearer token", async () => {
    const page: ClinicalHistoryPage = { items: [item], nextCursor: null };
    const fetcher = vi.fn<TestFetch>(async () => json(page));
    const cursor = "opaque+/cursor==";

    await expect(createApi(fetcher).getClinicalHistory(patientId, {
      cursor,
      pageSize: 20,
      eventType: "COMPLETED_PRE_TRIAGE",
    })).resolves.toEqual(page);

    const [url, init] = fetcher.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe(`/api/v1/patients/${patientId}/clinical-history`);
    expect(parsed.searchParams.get("cursor")).toBe(cursor);
    expect(parsed.searchParams.get("pageSize")).toBe("20");
    expect(parsed.searchParams.get("eventType")).toBe("COMPLETED_PRE_TRIAGE");
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer phase-5-access");
  });

  it("reads an event through the patient-scoped detail route", async () => {
    const detail: ClinicalHistoryEventDetail = {
      ...item,
      primarySymptom: { code: "HEADACHE", display: "Headache" },
      duration: { value: 2, unit: "DAYS" },
      intensity: 7,
      additionalSymptoms: ["FEVER"],
      provenance: { sourceType: source.type, sourceId: source.id, questionnaireVersionId: source.questionnaireVersionId, clinicalRuleSetVersionId: source.clinicalRuleSetVersionId },
      amendments: [],
    };
    const fetcher = vi.fn<TestFetch>(async () => json(detail));

    await expect(createApi(fetcher).getClinicalHistoryEvent(patientId, eventId)).resolves.toEqual(detail);
    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/patients/${patientId}/clinical-history/${eventId}`);
  });

  it("creates an amendment from source episode ID with exactly the documented body", async () => {
    const response = {
      amendmentId: "70000000-0000-0000-0000-000000000007",
      reason: "Correct reported duration",
      author: { type: "BEEEXY_ACCOUNT" as const, beeexyId: "BXY-1" },
      createdAt: "2026-08-24T15:00:00Z",
      provenance: { sourceType: source.type, sourceId: source.id, questionnaireVersionId: source.questionnaireVersionId, clinicalRuleSetVersionId: source.clinicalRuleSetVersionId },
    };
    const fetcher = vi.fn<TestFetch>(async () => json(response, 201));
    const request = { idempotencyKey: "80000000-0000-0000-0000-000000000008", reason: "Correct reported duration" };

    await expect(createApi(fetcher).createPreTriageAmendment(episodeId, request)).resolves.toEqual(response);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/pre-triage/episodes/${episodeId}/amendments`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(Object.keys(JSON.parse(String(init?.body)))).toEqual(["idempotencyKey", "reason"]);
  });

  it("forwards cancellation without converting it into a retryable network failure", async () => {
    const fetcher = vi.fn<TestFetch>(async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const controller = new AbortController();
    const request = createApi(fetcher).getClinicalHistory(patientId, {}, controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});
