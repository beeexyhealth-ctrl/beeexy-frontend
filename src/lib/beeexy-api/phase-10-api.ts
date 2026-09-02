import { BeeexyApiClient } from "./api-client";
import { beeexyApiClient } from "./auth-api";
import type {
  AiConversation,
  AiConversationDetail,
  AiConversationExecution,
  AiConversationPage,
  AiDocument,
  CreateAiConversationRequest,
  ListAiConversationsQuery,
  RequestSecondOpinionRequest,
  SecondOpinion,
  SecondOpinionAccepted,
  SendAiConversationMessageRequest,
  Uuid,
} from "./contracts";

export const AI_DOCUMENT_MAX_SIZE_BYTES = 26_214_400;
export const AI_DOCUMENT_SUPPORTED_MEDIA_TYPES = ["application/pdf", "text/plain"] as const;

function appendConversationQuery(path: string, query: ListAiConversationsQuery) {
  const parameters = new URLSearchParams();
  if (query.cursor !== undefined) parameters.set("cursor", query.cursor);
  if (query.pageSize !== undefined) parameters.set("pageSize", String(query.pageSize));

  const encoded = parameters.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export class BeeexyPhase10Api {
  constructor(private readonly client: BeeexyApiClient) {}

  createAiConversation(request: CreateAiConversationRequest, signal?: AbortSignal) {
    return this.client.requestAuthenticated<AiConversation>(
      "/api/v1/ai/conversations",
      { method: "POST", body: request, expectedStatus: 201, signal },
    );
  }

  listAiConversations(query: ListAiConversationsQuery = {}, signal?: AbortSignal) {
    return this.client.requestAuthenticated<AiConversationPage>(
      appendConversationQuery("/api/v1/ai/conversations", query),
      { expectedStatus: 200, signal },
    );
  }

  getAiConversation(conversationId: Uuid, signal?: AbortSignal) {
    return this.client.requestAuthenticated<AiConversationDetail>(
      `/api/v1/ai/conversations/${encodeURIComponent(conversationId)}`,
      { expectedStatus: 200, signal },
    );
  }

  sendAiConversationMessage(
    conversationId: Uuid,
    request: SendAiConversationMessageRequest,
    signal?: AbortSignal,
  ) {
    return this.client.requestAuthenticated<AiConversationExecution>(
      `/api/v1/ai/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: "POST", body: request, expectedStatus: 202, signal },
    );
  }

  deleteAiConversation(conversationId: Uuid, signal?: AbortSignal) {
    return this.client.requestAuthenticated<void>(
      `/api/v1/ai/conversations/${encodeURIComponent(conversationId)}`,
      { method: "DELETE", expectedStatus: 204, signal },
    );
  }

  uploadAiDocument(file: File, signal?: AbortSignal) {
    const formData = new FormData();
    formData.append("file", file);

    return this.client.requestAuthenticated<AiDocument>(
      "/api/v1/ai/documents",
      { method: "POST", formData, expectedStatus: 201, signal },
    );
  }

  deleteAiDocument(documentId: Uuid, signal?: AbortSignal) {
    return this.client.requestAuthenticated<void>(
      `/api/v1/ai/documents/${encodeURIComponent(documentId)}`,
      { method: "DELETE", expectedStatus: 204, signal },
    );
  }

  requestSecondOpinion(request: RequestSecondOpinionRequest, signal?: AbortSignal) {
    return this.client.requestAuthenticated<SecondOpinionAccepted>(
      "/api/v1/ai/second-opinions",
      { method: "POST", body: request, expectedStatus: 202, signal },
    );
  }

  getSecondOpinion(analysisId: Uuid, signal?: AbortSignal) {
    return this.client.requestAuthenticated<SecondOpinion>(
      `/api/v1/ai/second-opinions/${encodeURIComponent(analysisId)}`,
      { expectedStatus: 200, signal },
    );
  }

  regenerateSecondOpinion(analysisId: Uuid, signal?: AbortSignal) {
    return this.client.requestAuthenticated<SecondOpinionAccepted>(
      `/api/v1/ai/second-opinions/${encodeURIComponent(analysisId)}/regenerate`,
      { method: "POST", expectedStatus: 202, signal },
    );
  }
}

export const beeexyPhase10Api = new BeeexyPhase10Api(beeexyApiClient);
