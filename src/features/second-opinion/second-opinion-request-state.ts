import type {
  AiDocument,
  ClinicalHistoryItem,
  RequestSecondOpinionRequest,
} from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export const SECOND_OPINION_TEXT_MAX_LENGTH = 8_000;
export const SECOND_OPINION_HISTORY_MAX_SELECTIONS = 3;

export type SelectedPreTriage = {
  completedAt: string;
  label: string;
  sessionId: string;
};

export type SecondOpinionRequestDraft = {
  patientId: string;
  text: string;
  document: AiDocument | null;
  preTriage: SelectedPreTriage | null;
  clinicalHistory: ClinicalHistoryItem[];
};

export function isUsableAiDocument(document: AiDocument | null, now = Date.now()): document is AiDocument {
  if (!document || document.status !== "active") return false;
  const expiresAt = Date.parse(document.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function hasSecondOpinionSource(draft: Pick<SecondOpinionRequestDraft, "text" | "document" | "preTriage" | "clinicalHistory">) {
  return Boolean(
    draft.text.trim()
    || isUsableAiDocument(draft.document)
    || draft.preTriage
    || draft.clinicalHistory.length,
  );
}

export function buildSecondOpinionRequest(draft: SecondOpinionRequestDraft): RequestSecondOpinionRequest {
  const request: RequestSecondOpinionRequest = { patientId: draft.patientId };
  const text = draft.text.trim();
  if (text) request.text = text;
  if (isUsableAiDocument(draft.document)) request.documentIds = [draft.document.documentId];
  if (draft.preTriage) request.preTriageSessionId = draft.preTriage.sessionId;
  if (draft.clinicalHistory.length) {
    request.clinicalHistoryEventIds = draft.clinicalHistory.map((item) => item.eventId);
  }
  return request;
}

export type SecondOpinionSubmissionError = {
  clearClinicalHistory: boolean;
  clearDocument: boolean;
  clearPreTriage: boolean;
  destination: "case" | "context" | "review";
  message: string;
};

export function secondOpinionSubmissionError(error: unknown): SecondOpinionSubmissionError {
  const safe = (message: string, options: Partial<SecondOpinionSubmissionError> = {}): SecondOpinionSubmissionError => ({
    clearClinicalHistory: false,
    clearDocument: false,
    clearPreTriage: false,
    destination: "review",
    message,
    ...options,
  });

  if (error instanceof BeeexyApiError && error.status === 401) {
    return safe("Your session has ended. Sign in again before requesting a Second Opinion.");
  }
  if (error instanceof BeeexyApiError && error.status === 404) {
    return safe(
      "Some selected information is no longer available. Review the patient and additional information before trying again.",
      { clearClinicalHistory: true, clearDocument: true, clearPreTriage: true, destination: "case" },
    );
  }
  if (error instanceof BeeexyApiError && error.status === 409) {
    return safe(
      "The selected Pre-Triage information is not ready to use. Choose completed information and try again.",
      { clearPreTriage: true, destination: "context" },
    );
  }
  if (error instanceof BeeexyApiError && error.status === 422) {
    const code = error.problem?.errorCode;
    if (code === "ai.second_opinion.text_invalid") {
      return safe(
        `The case description must contain meaningful text and be no longer than ${SECOND_OPINION_TEXT_MAX_LENGTH.toLocaleString("en-US")} characters.`,
        { destination: "case" },
      );
    }
    if (code === "ai.second_opinion.input_required") {
      return safe("Add a case description or at least one item of additional information.", { destination: "context" });
    }
    if (code === "ai.second_opinion.document_unavailable") {
      return safe(
        "The temporary document is no longer available for this request. Upload another document or continue with a different source.",
        { clearDocument: true, destination: "context" },
      );
    }
    if (code === "ai.second_opinion.document_text_unavailable") {
      return safe(
        "Beeexy could not use the temporary document text for this request. Upload another document or continue with a different source.",
        { clearDocument: true, destination: "context" },
      );
    }
    if (code === "ai.second_opinion.history_limit") {
      return safe(
        `Choose no more than ${SECOND_OPINION_HISTORY_MAX_SELECTIONS} Clinical History records.`,
        { destination: "context" },
      );
    }
    if (code === "ai.second_opinion.document_limit") {
      return safe("Choose no more than one temporary document.", { destination: "context" });
    }
    if (code === "ai.second_opinion.source_ids_invalid") {
      return safe(
        "Some selected information could not be used. Choose the additional information again.",
        { clearClinicalHistory: true, clearDocument: true, clearPreTriage: true, destination: "context" },
      );
    }
    return safe("Beeexy could not validate this request. Review the information and try again.");
  }
  if (error instanceof BeeexyNetworkError || (error instanceof BeeexyApiError && error.status >= 500)) {
    return safe("We couldn’t confirm whether the request was created. Beeexy won’t retry automatically; review the information before trying again.");
  }
  return safe("Beeexy couldn’t create this Second Opinion request right now. Your information is still available for review.");
}

export function formatSecondOpinionDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
