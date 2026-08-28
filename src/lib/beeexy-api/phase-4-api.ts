import { BeeexyApiClient, type BeeexyApiResponse } from "./api-client";
import { beeexyApiClient } from "./auth-api";
import type {
  ClaimAnonymousPreTriageResponse,
  CompletePreTriageResponse,
  PreTriageAnswerResponse,
  PreTriageConversationProjection,
  PreTriageSessionStartResponse,
  StartPreTriageFromIntakeRequest,
  StartPreTriageFromIntakeResponse,
  StartPreTriageRequest,
  SubmitPreTriageAnswersRequest,
} from "./contracts";

export const PRE_TRIAGE_CAPABILITY_HEADER = "X-Pre-Triage-Capability";
export const PRE_TRIAGE_IDEMPOTENCY_HEADER = "Idempotency-Key";

export type PreTriageAccess =
  | { mode: "authenticated" }
  | { mode: "anonymous"; capability: string };

export type PreTriageIntakeAccess =
  | { mode: "authenticated" }
  | { mode: "anonymous"; capability?: string };

export class BeeexyPhase4Api {
  constructor(private readonly client: BeeexyApiClient) {}

  startPreTriage(request: StartPreTriageRequest, mode: PreTriageAccess["mode"], signal?: AbortSignal) {
    if (mode === "anonymous") {
      return this.client.requestPublic<PreTriageSessionStartResponse>("/api/v1/pre-triage/sessions", {
        method: "POST",
        body: request,
        expectedStatus: 201,
        signal,
      });
    }
    return this.client.requestAuthenticated<PreTriageSessionStartResponse>("/api/v1/pre-triage/sessions", {
      method: "POST",
      body: request,
      expectedStatus: 201,
      signal,
    });
  }

  startPreTriageFromIntake(
    request: StartPreTriageFromIntakeRequest,
    access: PreTriageIntakeAccess,
    idempotencyKey: string,
    signal?: AbortSignal,
  ) {
    const headers = {
      [PRE_TRIAGE_IDEMPOTENCY_HEADER]: idempotencyKey,
      ...(access.mode === "anonymous" && access.capability
        ? capabilityHeaders(access.capability)
        : {}),
    };
    const options = {
      method: "POST" as const,
      body: request,
      headers,
      expectedStatus: [200, 201],
      signal,
    };
    if (access.mode === "anonymous") {
      return this.client.requestPublic<StartPreTriageFromIntakeResponse>("/api/v1/pre-triage/intake", options);
    }
    return this.client.requestAuthenticated<StartPreTriageFromIntakeResponse>("/api/v1/pre-triage/intake", options);
  }

  submitPreTriageAnswers(sessionId: string, request: SubmitPreTriageAnswersRequest, access: PreTriageAccess, signal?: AbortSignal) {
    const path = sessionPath(sessionId, "answers");
    if (access.mode === "anonymous") {
      return this.client.requestPublic<PreTriageAnswerResponse>(path, {
        method: "POST",
        body: request,
        headers: capabilityHeaders(access.capability),
        expectedStatus: 200,
        signal,
      });
    }
    return this.client.requestAuthenticated<PreTriageAnswerResponse>(path, {
      method: "POST",
      body: request,
      expectedStatus: 200,
      signal,
    });
  }

  completePreTriage(sessionId: string, access: PreTriageAccess, signal?: AbortSignal): Promise<BeeexyApiResponse<CompletePreTriageResponse>> {
    const path = sessionPath(sessionId, "complete");
    if (access.mode === "anonymous") {
      return this.client.requestPublicResponse<CompletePreTriageResponse>(path, {
        method: "POST",
        headers: capabilityHeaders(access.capability),
        expectedStatus: [200, 201],
        signal,
      });
    }
    return this.client.requestAuthenticatedResponse<CompletePreTriageResponse>(path, {
      method: "POST",
      expectedStatus: [200, 201],
      signal,
    });
  }

  getPreTriageResult(sessionId: string, access: PreTriageAccess, signal?: AbortSignal) {
    const path = sessionPath(sessionId, "result");
    if (access.mode === "anonymous") {
      return this.client.requestPublic<CompletePreTriageResponse>(path, {
        headers: capabilityHeaders(access.capability),
        expectedStatus: 200,
        signal,
      });
    }
    return this.client.requestAuthenticated<CompletePreTriageResponse>(path, { expectedStatus: 200, signal });
  }

  getPreTriageConversation(sessionId: string, access: PreTriageAccess, signal?: AbortSignal) {
    const path = sessionPath(sessionId, "conversation");
    if (access.mode === "anonymous") {
      return this.client.requestPublic<PreTriageConversationProjection>(path, {
        headers: capabilityHeaders(access.capability),
        expectedStatus: 200,
        signal,
      });
    }
    return this.client.requestAuthenticated<PreTriageConversationProjection>(path, {
      expectedStatus: 200,
      signal,
    });
  }

  claimAnonymousPreTriage(sessionId: string, anonymousCapability: string) {
    return this.client.requestAuthenticated<ClaimAnonymousPreTriageResponse>(sessionPath(sessionId, "claim"), {
      method: "POST",
      headers: capabilityHeaders(anonymousCapability),
      expectedStatus: 200,
    });
  }
}

function capabilityHeaders(capability: string) {
  return { [PRE_TRIAGE_CAPABILITY_HEADER]: capability };
}

function sessionPath(sessionId: string, action: "answers" | "complete" | "conversation" | "result" | "claim") {
  return `/api/v1/pre-triage/sessions/${encodeURIComponent(sessionId)}/${action}`;
}

export const beeexyPhase4Api = new BeeexyPhase4Api(beeexyApiClient);
