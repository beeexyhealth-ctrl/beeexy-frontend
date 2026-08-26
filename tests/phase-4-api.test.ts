import { describe, expect, it, vi } from "vitest";
import { BeeexyApiClient } from "@/lib/beeexy-api/api-client";
import type {
  AuthenticationResponse,
  NeutralPreTriageResult,
  PreTriageAnswerResponse,
  PreTriageConversationProjection,
  PreTriageSessionStartResponse,
} from "@/lib/beeexy-api/contracts";
import {
  BeeexyPhase4Api,
  PRE_TRIAGE_CAPABILITY_HEADER,
  PRE_TRIAGE_IDEMPOTENCY_HEADER,
} from "@/lib/beeexy-api/phase-4-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import type { BeeexySession, SessionStore } from "@/lib/beeexy-api/session-storage";

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const baseUrl = "http://localhost:5105";
const sessionId = "40000000-0000-0000-0000-000000000004";
const capability = "anonymous-secret";
const questionnaireVersion = "2026.08.22-demo.1";

const session: BeeexySession = {
  accessToken: "access-a",
  refreshToken: "refresh-a",
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
  account: { accountId: "account-1", profileId: "patient-1", beeexyId: "BXY-1" },
};

const refreshed: AuthenticationResponse = {
  accessToken: "access-b",
  refreshToken: "refresh-b",
  accessTokenExpiresAt: "2099-03-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-04-01T00:00:00Z",
  account: session.account,
};

const commonConversation: PreTriageConversationProjection = {
    sessionId,
    sessionStatus: "ACTIVE",
    state: "IN_PROGRESS",
    expiresAt: "2099-01-02T00:00:00Z",
    pathway: { code: "HEADACHE", label: "Headache" },
    questionnaire: { code: "headache-demo-questionnaire", version: questionnaireVersion },
    ruleSet: { code: "headache-demo-neutral-rules", version: questionnaireVersion },
    progress: { completed: 0, total: 3, percentage: 0 },
    acceptedValues: {},
    nextInteraction: {
      field: "duration",
      questionCode: "DURATION",
      prompt: "How long ago did the headache start?",
      inputType: "DURATION",
      required: true,
      constraints: { minimum: 0, exclusiveMinimum: true, allowedUnits: ["MINUTES", "HOURS", "DAYS", "WEEKS", "MONTHS"] },
      options: [],
    },
};

const commonStart = {
  sessionId,
  pathway: "HEADACHE" as const,
  status: "Active" as const,
  expiresAt: "2099-01-02T00:00:00Z",
  questionnaire: { code: "headache-demo-questionnaire", version: questionnaireVersion },
  ruleSet: { code: "headache-demo-neutral-rules", version: questionnaireVersion },
  clinicalContent: { source: "PRODUCT_DEMO_DEFINED" as const, reviewStatus: "NOT_APPLICABLE" as const, clinicalApproval: "NOT_CLINICALLY_APPROVED" as const },
  conversation: commonConversation,
};

const answerResponse: PreTriageAnswerResponse = {
  sessionId,
  pathway: "HEADACHE",
  questionnaireVersion,
  outcome: "ACCEPTED",
  acceptedAnswers: ["DURATION", "INTENSITY", "ADDITIONAL_SYMPTOMS"],
  acceptedValues: {
    duration: { value: 1, unit: "MONTHS" },
    intensity: 3,
    additionalSymptoms: ["NAUSEA"],
  },
  progression: {
    state: "IN_PROGRESS",
    answeredRequiredFields: ["DURATION"],
    missingRequiredFields: ["INTENSITY", "ADDITIONAL_SYMPTOMS"],
    nextQuestion: { code: "INTENSITY", prompt: "Backend intensity prompt", answerType: "INTEGER_SCALE", allowedValues: [], allowedUnits: [], minimum: 1, maximum: 10 },
    readyToComplete: false,
  },
  conversation: {
    ...commonConversation,
    state: "READY_FOR_REVIEW",
    progress: { completed: 3, total: 3, percentage: 100 },
    acceptedValues: {
      duration: { value: 1, unit: "MONTHS" },
      intensity: 3,
      additionalSymptoms: ["NAUSEA"],
    },
    nextInteraction: undefined,
  },
};

const result: NeutralPreTriageResult = {
  sessionId,
  episodeId: "episode-1",
  primarySymptom: { code: "HEADACHE", display: "Headache" },
  duration: { value: 2, unit: "DAYS" },
  intensity: 5,
  additionalSymptoms: [],
  completedAt: "2026-08-22T12:05:00Z",
  questionnaire: commonStart.questionnaire,
  package: commonStart.ruleSet,
  clinicalContent: commonStart.clinicalContent,
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

function createApi(fetcher: TestFetch, store = new MemoryStore()) {
  return new BeeexyPhase4Api(new BeeexyApiClient(baseUrl, store, fetcher));
}

describe("Beeexy Phase 4 API contract", () => {
  it("starts an anonymous session with the exact path/body and no credentials", async () => {
    const response: PreTriageSessionStartResponse = { ...commonStart, anonymousCapability: capability };
    const fetcher = vi.fn<TestFetch>(async () => json(response, 201));

    await expect(createApi(fetcher, new MemoryStore(null)).startPreTriage({ pathway: "HEADACHE" }, "anonymous")).resolves.toEqual(response);

    const [url, init] = fetcher.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(url).toBe(`${baseUrl}/api/v1/pre-triage/sessions`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ pathway: "HEADACHE" });
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get(PRE_TRIAGE_CAPABILITY_HEADER)).toBeNull();
  });

  it("starts an authenticated managed-patient session with Bearer and patientId", async () => {
    const response: PreTriageSessionStartResponse = { ...commonStart, patientId: "managed-2" };
    const fetcher = vi.fn<TestFetch>(async () => json(response, 201));

    await createApi(fetcher).startPreTriage({ pathway: "HEADACHE", patientId: "managed-2" }, "authenticated");

    const init = fetcher.mock.calls[0][1];
    expect(JSON.parse(String(init?.body))).toEqual({ pathway: "HEADACHE", patientId: "managed-2" });
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer access-a");
  });

  it("submits anonymous free-text intake with the exact body, durable key, cookies, and no Bearer", async () => {
    const response = { resolution: "UNRESOLVED" as const };
    const fetcher = vi.fn<TestFetch>(async () => json(response));

    await expect(createApi(fetcher, new MemoryStore(null)).startPreTriageFromIntake(
      { text: "My stomach has hurt for two days." },
      { mode: "anonymous" },
      "intake-operation-k1",
    )).resolves.toEqual(response);

    const [url, init] = fetcher.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(url).toBe(`${baseUrl}/api/v1/pre-triage/intake`);
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toEqual({ text: "My stomach has hurt for two days." });
    expect(Object.keys(JSON.parse(String(init?.body)))).toEqual(["text"]);
    expect(headers.get(PRE_TRIAGE_IDEMPOTENCY_HEADER)).toBe("intake-operation-k1");
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get(PRE_TRIAGE_CAPABILITY_HEADER)).toBeNull();
  });

  it("keeps the same intake key and body through authenticated refresh and never places text in the URL", async () => {
    const store = new MemoryStore();
    let intakeCalls = 0;
    const response = { resolution: "AMBIGUOUS" as const, candidatePathways: ["HEADACHE" as const, "CHEST_PAIN" as const] };
    const fetcher = vi.fn<TestFetch>(async (input) => {
      if (String(input).endsWith("/auth/refresh")) return json(refreshed);
      intakeCalls += 1;
      return intakeCalls === 1 ? json({ status: 401 }, 401) : json(response);
    });

    await expect(createApi(fetcher, store).startPreTriageFromIntake(
      { text: "Pain in my head or chest" },
      { mode: "authenticated" },
      "intake-operation-k2",
    )).resolves.toEqual(response);

    const intakeRequests = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/api/v1/pre-triage/intake"));
    expect(intakeRequests).toHaveLength(2);
    for (const [url, init] of intakeRequests) {
      expect(String(url)).not.toContain("Pain");
      expect(JSON.parse(String(init?.body))).toEqual({ text: "Pain in my head or chest" });
      expect((init?.headers as Headers).get(PRE_TRIAGE_IDEMPOTENCY_HEADER)).toBe("intake-operation-k2");
    }
  });

  it("submits anonymous answers with capability, no Bearer, and the exact natural-language body", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(answerResponse));

    const response = await createApi(fetcher, new MemoryStore(null)).submitPreTriageAnswers(sessionId, { questionnaireVersion, naturalLanguage: "It started yesterday." }, { mode: "anonymous", capability });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/pre-triage/sessions/${sessionId}/answers`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ questionnaireVersion, naturalLanguage: "It started yesterday." });
    expect((init?.headers as Headers).get(PRE_TRIAGE_CAPABILITY_HEADER)).toBe(capability);
    expect((init?.headers as Headers).get("Authorization")).toBeNull();
    expect(response.acceptedValues).toEqual({
      duration: { value: 1, unit: "MONTHS" },
      intensity: 3,
      additionalSymptoms: ["NAUSEA"],
    });
  });

  it("completes without a body and preserves whether the backend returned 201", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(result, 201));
    const controller = new AbortController();

    const response = await createApi(fetcher, new MemoryStore(null)).completePreTriage(sessionId, { mode: "anonymous", capability }, controller.signal);

    expect(response).toEqual({ status: 201, data: result });
    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/pre-triage/sessions/${sessionId}/complete`);
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  it("retrieves the canonical result with GET and the anonymous capability", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(result));

    await expect(createApi(fetcher, new MemoryStore(null)).getPreTriageResult(sessionId, { mode: "anonymous", capability })).resolves.toEqual(result);

    expect(fetcher.mock.calls[0][1]?.method).toBe("GET");
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get(PRE_TRIAGE_CAPABILITY_HEADER)).toBe(capability);
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });

  it("loads the exact conversation projection route with anonymous capability", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(commonConversation));

    await expect(createApi(fetcher, new MemoryStore(null)).getPreTriageConversation(
      sessionId,
      { mode: "anonymous", capability },
    )).resolves.toEqual(commonConversation);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/pre-triage/sessions/${sessionId}/conversation`);
    expect(init?.method).toBe("GET");
    expect((init?.headers as Headers).get(PRE_TRIAGE_CAPABILITY_HEADER)).toBe(capability);
    expect((init?.headers as Headers).get("Authorization")).toBeNull();
  });

  it("claims with Bearer plus capability, no body/query/patient selector", async () => {
    const claim = { sessionId, episodeId: "episode-1", patientId: "patient-1", claimedAt: "2026-08-22T13:00:00Z" };
    const fetcher = vi.fn<TestFetch>(async () => json(claim));

    await expect(createApi(fetcher).claimAnonymousPreTriage(sessionId, capability)).resolves.toEqual(claim);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/pre-triage/sessions/${sessionId}/claim`);
    expect(url).not.toContain("?");
    expect(init?.body).toBeUndefined();
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer access-a");
    expect((init?.headers as Headers).get(PRE_TRIAGE_CAPABILITY_HEADER)).toBe(capability);
  });

  it("keeps the capability header through the centralized one-time Bearer refresh retry", async () => {
    const store = new MemoryStore({ ...session, accessTokenExpiresAt: "2099-01-01T00:00:00Z" });
    let claimCalls = 0;
    const seen: Array<[string | null, string | null]> = [];
    const fetcher = vi.fn<TestFetch>(async (input, init) => {
      if (String(input).endsWith("/auth/refresh")) return json(refreshed);
      claimCalls += 1;
      const headers = init?.headers as Headers;
      seen.push([headers.get("Authorization"), headers.get(PRE_TRIAGE_CAPABILITY_HEADER)]);
      return claimCalls === 1 ? json({ status: 401 }, 401) : json({ sessionId, episodeId: "episode-1", patientId: "patient-1", claimedAt: "now" });
    });

    await createApi(fetcher, store).claimAnonymousPreTriage(sessionId, capability);

    expect(seen).toEqual([["Bearer access-a", capability], ["Bearer access-b", capability]]);
  });

  it("normalizes stable Problem Details without exposing raw detail as the message", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json({ status: 422, errorCode: "pre_triage.intensity_invalid", detail: "internal validation detail", correlationId: "corr-4" }, 422));

    const error = await createApi(fetcher).submitPreTriageAnswers(sessionId, { structured: { intensity: 11 } }, { mode: "authenticated" }).catch((caught) => caught);

    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error.problem.errorCode).toBe("pre_triage.intensity_invalid");
    expect(error.correlationId).toBe("corr-4");
    expect(error.message).not.toContain("internal validation detail");
  });
});
