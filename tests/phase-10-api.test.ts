import { describe, expect, it, vi } from "vitest";
import { BeeexyApiClient } from "@/lib/beeexy-api/api-client";
import type {
  AiConversation,
  AiConversationDetail,
  AiConversationExecution,
  AiDocument,
  Phase10ErrorCode,
  RequestSecondOpinionRequest,
  SecondOpinion,
  SecondOpinionAccepted,
} from "@/lib/beeexy-api/contracts";
import {
  AI_DOCUMENT_MAX_SIZE_BYTES,
  AI_DOCUMENT_SUPPORTED_MEDIA_TYPES,
  BeeexyPhase10Api,
} from "@/lib/beeexy-api/phase-10-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import type { BeeexySession, SessionStore } from "@/lib/beeexy-api/session-storage";

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const baseUrl = "http://localhost:5105";
const conversationId = "bf981c53-bf8e-41e2-ad47-1c6cf8574d85";
const userMessageId = "4a4f5b9d-54cc-426a-a600-ece49a1c88e7";
const assistantMessageId = "7c07cc20-a45e-49fd-b569-d9153f0587ee";
const conversationExecutionId = "11cf606a-fadf-48cb-a174-4170666b9f55";
const patientId = "9fb45f87-f9dd-4dbf-a2d5-b2be4cd41624";
const documentId = "e8371933-f732-42d7-a0b2-a17d2c6b3825";
const analysisId = "97c61f6e-acf7-4e99-9ea0-cb672904c81e";
const secondOpinionExecutionId = "e12565e6-7201-47e2-adf1-ebaf7891eaae";

const session: BeeexySession = {
  accessToken: "phase-10-access",
  refreshToken: "phase-10-refresh",
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
  account: { accountId: "account-1", profileId: patientId, beeexyId: "BXY-1" },
};

const disclaimer = {
  version: "ai-general-disclaimer-v1",
  content: "Esta respuesta ha sido generada por inteligencia artificial.",
};

const conversation: AiConversation = {
  conversationId,
  patientId,
  createdAt: "2026-09-02T15:10:00+00:00",
  disclaimer,
};

const detail: AiConversationDetail = {
  conversation: {
    conversationId,
    patientId: null,
    createdAt: conversation.createdAt,
  },
  messages: [
    {
      messageId: userMessageId,
      role: "user",
      content: "What does hydration mean for general health?",
      sequence: 1,
      createdAt: "2026-09-02T15:11:00+00:00",
    },
    {
      messageId: assistantMessageId,
      role: "assistant",
      content: "Approved informational content or a fixed Beeexy fallback.",
      sequence: 2,
      createdAt: "2026-09-02T15:11:01+00:00",
    },
  ],
  disclaimer,
};

const conversationExecution: AiConversationExecution = {
  conversationId,
  userMessageId,
  executionId: conversationExecutionId,
  status: "completed",
  assistantMessage: detail.messages[1],
  disclaimer,
};

const document: AiDocument = {
  documentId,
  contentType: "text/plain",
  sizeBytes: 4172,
  uploadedAt: "2026-09-02T15:20:00+00:00",
  expiresAt: "2026-09-03T15:20:00+00:00",
  status: "active",
};

const accepted: SecondOpinionAccepted = {
  analysisId,
  executionId: secondOpinionExecutionId,
  status: "succeeded",
  statusUrl: `/api/v1/ai/second-opinions/${analysisId}`,
};

const secondOpinion: SecondOpinion = {
  analysisId,
  patientId,
  executionId: secondOpinionExecutionId,
  status: "succeeded",
  result: {
    summary: "A safety-approved educational summary.",
    importantPoints: ["A relevant point to discuss with the doctor."],
    possibleQuestionsForDoctor: ["What context would help clarify this?"],
    missingInformation: [],
    disclaimer: "This is not a medical diagnosis.",
  },
  metadata: {
    aiGenerated: true,
    generatedAt: "2026-09-02T15:30:00+00:00",
    resultVersion: "ai-second-opinion-result@v1",
    provider: "opaque-backend-provider-id",
    modelVersion: "opaque-backend-model-id",
    promptVersion: "ai-second-opinion@v1",
    disclaimerVersion: "ai-second-opinion-disclaimer-v1",
  },
};

class MemoryStore implements SessionStore {
  constructor(private value: BeeexySession | null = session) {}
  clear() { this.value = null; }
  read() { return this.value; }
  write(next: BeeexySession) { this.value = next; }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createApi(fetcher: TestFetch, store = new MemoryStore()) {
  return new BeeexyPhase10Api(new BeeexyApiClient(baseUrl, store, fetcher));
}

function requestBody(fetcher: ReturnType<typeof vi.fn<TestFetch>>) {
  return JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as Record<string, unknown>;
}

function expectAuthenticatedRequest(fetcher: ReturnType<typeof vi.fn<TestFetch>>, signal: AbortSignal) {
  const init = fetcher.mock.calls[0][1];
  expect((init?.headers as Headers).get("Authorization")).toBe("Bearer phase-10-access");
  expect((init?.headers as Headers).get("Accept")).toBe("application/json");
  expect(init?.signal).toBe(signal);
}

async function capturedError(action: () => Promise<unknown>) {
  return action().catch((reason: unknown) => reason);
}

describe("Beeexy Phase 10 API contract", () => {
  it("exposes only the documented temporary-document UX constraints", () => {
    expect(AI_DOCUMENT_MAX_SIZE_BYTES).toBe(26_214_400);
    expect(AI_DOCUMENT_SUPPORTED_MEDIA_TYPES).toEqual(["application/pdf", "text/plain"]);
  });

  it("creates an authenticated AI conversation with the exact request and cancellation signal", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(conversation, 201));
    const controller = new AbortController();
    const request = { purpose: "GENERAL_HEALTH" as const, patientId };

    await expect(createApi(fetcher).createAiConversation(request, controller.signal))
      .resolves.toEqual(conversation);

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/ai/conversations`);
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
    expect(requestBody(fetcher)).toEqual(request);
    expectAuthenticatedRequest(fetcher, controller.signal);
  });

  it("preserves conversation creation validation Problem Details", async () => {
    const code = "ai.conversation.purpose_invalid" satisfies Phase10ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status: 422, errorCode: code }, 422));

    const error = await capturedError(() => createApi(fetcher).createAiConversation({
      purpose: "GENERAL_HEALTH",
    }));

    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error).toMatchObject({ status: 422, problem: { errorCode: code } });
  });

  it("lists conversations with an opaque encoded cursor and exact page size", async () => {
    const page = { items: [detail.conversation], nextCursor: "next" };
    const fetcher = vi.fn<TestFetch>(async () => json(page));
    const controller = new AbortController();

    await expect(createApi(fetcher).listAiConversations(
      { cursor: "opaque+/=? token", pageSize: 20 },
      controller.signal,
    )).resolves.toEqual(page);

    expect(fetcher.mock.calls[0][0]).toBe(
      `${baseUrl}/api/v1/ai/conversations?cursor=opaque%2B%2F%3D%3F+token&pageSize=20`,
    );
    expect(fetcher.mock.calls[0][1]?.method).toBe("GET");
    expectAuthenticatedRequest(fetcher, controller.signal);
  });

  it("omits undefined conversation query values and preserves invalid cursors", async () => {
    const code = "ai.conversation.cursor_invalid" satisfies Phase10ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status: 422, errorCode: code }, 422));

    const error = await capturedError(() => createApi(fetcher).listAiConversations({
      cursor: undefined,
      pageSize: undefined,
    }));

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/ai/conversations`);
    expect(error).toMatchObject({ status: 422, problem: { errorCode: code } });
  });

  it("gets the ordered conversation detail from the encoded owner-only route", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(detail));
    const controller = new AbortController();

    await expect(createApi(fetcher).getAiConversation("conversation/id", controller.signal))
      .resolves.toEqual(detail);

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/ai/conversations/conversation%2Fid`);
    expectAuthenticatedRequest(fetcher, controller.signal);
  });

  it("preserves concealed conversation detail 404 responses", async () => {
    const code = "ai.conversation.not_found" satisfies Phase10ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status: 404, errorCode: code }, 404));

    const error = await capturedError(() => createApi(fetcher).getAiConversation(conversationId));

    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error).toMatchObject({ status: 404, problem: { errorCode: code } });
  });

  it("parses the terminal 202 conversation message body without polling", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(conversationExecution, 202));
    const controller = new AbortController();
    const request = { content: "What does hydration mean for general health?" };

    await expect(createApi(fetcher).sendAiConversationMessage(
      conversationId,
      request,
      controller.signal,
    )).resolves.toEqual(conversationExecution);

    expect(fetcher.mock.calls[0][0]).toBe(
      `${baseUrl}/api/v1/ai/conversations/${conversationId}/messages`,
    );
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
    expect(requestBody(fetcher)).toEqual(request);
    expect(fetcher).toHaveBeenCalledOnce();
    expectAuthenticatedRequest(fetcher, controller.signal);
  });

  it.each(["rejected", "failed"] as const)(
    "deserializes a terminal %s conversation response without an assistant message",
    async (status) => {
      const response: AiConversationExecution = {
        conversationId,
        userMessageId,
        executionId: conversationExecutionId,
        status,
        disclaimer,
      };
      const fetcher = vi.fn<TestFetch>(async () => json(response, 202));

      await expect(createApi(fetcher).sendAiConversationMessage(
        conversationId,
        { content: "A message" },
      )).resolves.toEqual(response);
    },
  );

  it.each([
    [409, "ai.conversation.execution_conflict"],
    [422, "ai.conversation.request_not_supported"],
    [422, "ai.conversation.message_limit_reached"],
  ] as const)("preserves message status %s with %s and does not retry", async (status, errorCode) => {
    const code = errorCode satisfies Phase10ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status, errorCode: code }, status));

    const error = await capturedError(() => createApi(fetcher).sendAiConversationMessage(
      conversationId,
      { content: "A message" },
    ));

    expect(error).toMatchObject({ status, problem: { errorCode: code } });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("logically deletes a conversation through a bodyless 204 request", async () => {
    const fetcher = vi.fn<TestFetch>(async () => new Response(null, { status: 204 }));
    const controller = new AbortController();

    await expect(createApi(fetcher).deleteAiConversation("conversation/id", controller.signal))
      .resolves.toBeUndefined();

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/ai/conversations/conversation%2Fid`);
    expect(fetcher.mock.calls[0][1]?.method).toBe("DELETE");
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get("Content-Type")).toBeNull();
    expectAuthenticatedRequest(fetcher, controller.signal);
  });

  it("uploads exactly one file FormData part without setting a multipart boundary", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(document, 201));
    const controller = new AbortController();
    const file = new File(["Useful UTF-8 text"], "report.txt", { type: "text/plain" });

    await expect(createApi(fetcher).uploadAiDocument(file, controller.signal))
      .resolves.toEqual(document);

    const [url, init] = fetcher.mock.calls[0];
    const body = init?.body;
    expect(url).toBe(`${baseUrl}/api/v1/ai/documents`);
    expect(init?.method).toBe("POST");
    expect(body).toBeInstanceOf(FormData);
    expect(Array.from((body as FormData).keys())).toEqual(["file"]);
    expect((body as FormData).get("file")).toBe(file);
    expect((init?.headers as Headers).get("Content-Type")).toBeNull();
    expectAuthenticatedRequest(fetcher, controller.signal);
  });

  it.each([
    [413, "ai.document.too_large"],
    [415, "ai.document.unsupported_media"],
    [422, "ai.document.unusable_text"],
  ] as const)("preserves document upload status %s and %s", async (status, errorCode) => {
    const code = errorCode satisfies Phase10ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status, errorCode: code }, status));
    const file = new File(["document"], "report.txt", { type: "text/plain" });

    const error = await capturedError(() => createApi(fetcher).uploadAiDocument(file));

    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error).toMatchObject({ status, problem: { errorCode: code } });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("deletes a temporary document through a bodyless authenticated 204 request", async () => {
    const fetcher = vi.fn<TestFetch>(async () => new Response(null, { status: 204 }));
    const controller = new AbortController();

    await expect(createApi(fetcher).deleteAiDocument("document/id", controller.signal))
      .resolves.toBeUndefined();

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/ai/documents/document%2Fid`);
    expect(fetcher.mock.calls[0][1]?.method).toBe("DELETE");
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
    expectAuthenticatedRequest(fetcher, controller.signal);
  });

  it("preserves concealed temporary-document 404 responses", async () => {
    const code = "ai.document.not_found" satisfies Phase10ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status: 404, errorCode: code }, 404));

    const error = await capturedError(() => createApi(fetcher).deleteAiDocument(documentId));

    expect(error).toMatchObject({ status: 404, problem: { errorCode: code } });
  });

  it("requests a Second Opinion with the exact selected inputs and parses its 202 receipt", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(accepted, 202));
    const controller = new AbortController();
    const request: RequestSecondOpinionRequest = {
      patientId,
      text: "Please help me understand the clinician's observations.",
      documentIds: [documentId],
      preTriageSessionId: "a63dd8e7-4d0b-4d98-ad47-7dcc215afdea",
      clinicalHistoryEventIds: ["672502d7-2f87-4496-980f-d58132975075"],
    };

    await expect(createApi(fetcher).requestSecondOpinion(request, controller.signal))
      .resolves.toEqual(accepted);

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/ai/second-opinions`);
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
    expect(requestBody(fetcher)).toEqual(request);
    expect(fetcher).toHaveBeenCalledOnce();
    expectAuthenticatedRequest(fetcher, controller.signal);
  });

  it.each([
    [404, "ai.second_opinion.not_found"],
    [422, "ai.second_opinion.document_limit"],
    [422, "ai.second_opinion.history_limit"],
  ] as const)("preserves Second Opinion request status %s and %s", async (status, errorCode) => {
    const code = errorCode satisfies Phase10ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status, errorCode: code }, status));

    const error = await capturedError(() => createApi(fetcher).requestSecondOpinion({
      patientId,
      text: "Context",
    }));

    expect(error).toMatchObject({ status, problem: { errorCode: code } });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("gets a successful Second Opinion result and metadata from the encoded route", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(secondOpinion));
    const controller = new AbortController();

    await expect(createApi(fetcher).getSecondOpinion("analysis/id", controller.signal))
      .resolves.toEqual(secondOpinion);

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/ai/second-opinions/analysis%2Fid`);
    expect(fetcher.mock.calls[0][1]?.method).toBe("GET");
    expectAuthenticatedRequest(fetcher, controller.signal);
  });

  it.each([
    ["pending", {}],
    ["running", {}],
    ["failed", {}],
    ["rejected", { safeMessage: "Beeexy-controlled fallback." }],
  ] as const)("deserializes the %s Second Opinion projection exactly", async (status, fields) => {
    const response: SecondOpinion = { analysisId, patientId, status, ...fields };
    const fetcher = vi.fn<TestFetch>(async () => json(response));

    await expect(createApi(fetcher).getSecondOpinion(analysisId)).resolves.toEqual(response);
  });

  it("preserves concealed Second Opinion read 404 responses", async () => {
    const code = "ai.second_opinion.not_found" satisfies Phase10ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status: 404, errorCode: code }, 404));

    const error = await capturedError(() => createApi(fetcher).getSecondOpinion(analysisId));

    expect(error).toMatchObject({ status: 404, problem: { errorCode: code } });
  });

  it("regenerates from immutable input with a bodyless POST and parses the 202 receipt", async () => {
    const regenerated: SecondOpinionAccepted = {
      ...accepted,
      executionId: "8ec464c6-9c90-4cb7-9c3f-13c197e95dd6",
    };
    const fetcher = vi.fn<TestFetch>(async () => json(regenerated, 202));
    const controller = new AbortController();

    await expect(createApi(fetcher).regenerateSecondOpinion("analysis/id", controller.signal))
      .resolves.toEqual(regenerated);

    expect(fetcher.mock.calls[0][0]).toBe(
      `${baseUrl}/api/v1/ai/second-opinions/analysis%2Fid/regenerate`,
    );
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get("Content-Type")).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
    expectAuthenticatedRequest(fetcher, controller.signal);
  });

  it("preserves regeneration conflicts without retrying or sending original inputs", async () => {
    const code = "ai.second_opinion.execution_conflict" satisfies Phase10ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status: 409, errorCode: code }, 409));

    const error = await capturedError(() => createApi(fetcher).regenerateSecondOpinion(analysisId));

    expect(error).toMatchObject({ status: 409, problem: { errorCode: code } });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });
});
