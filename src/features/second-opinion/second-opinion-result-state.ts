import type {
  SecondOpinion,
  SecondOpinionMetadata,
  SecondOpinionResult,
} from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export type SecondOpinionDisplayState =
  | { kind: "pending" }
  | { kind: "running" }
  | { kind: "succeeded"; metadata: SecondOpinionMetadata; result: SecondOpinionResult }
  | { kind: "failed" }
  | { kind: "rejected"; safeMessage: string }
  | { kind: "unsupported" };

export type SecondOpinionLoadError = {
  clearExisting: boolean;
  kind: "session" | "unavailable" | "network" | "server";
  message: string;
};

export type SecondOpinionRegenerationError = {
  blockRegeneration: boolean;
  canCheckStatus: boolean;
  clearExisting: boolean;
  kind: "session" | "unavailable" | "conflict" | "immutable-input" | "request-invalid" | "ambiguous" | "server";
  message: string;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSecondOpinionResult(value: unknown): value is SecondOpinionResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<SecondOpinionResult>;
  return typeof result.summary === "string"
    && isStringArray(result.importantPoints)
    && isStringArray(result.possibleQuestionsForDoctor)
    && isStringArray(result.missingInformation)
    && typeof result.disclaimer === "string";
}

function isSecondOpinionMetadata(value: unknown): value is SecondOpinionMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<SecondOpinionMetadata>;
  return typeof metadata.aiGenerated === "boolean"
    && typeof metadata.generatedAt === "string"
    && typeof metadata.resultVersion === "string"
    && (metadata.provider === undefined || typeof metadata.provider === "string")
    && (metadata.modelVersion === undefined || typeof metadata.modelVersion === "string")
    && (metadata.promptVersion === undefined || typeof metadata.promptVersion === "string")
    && typeof metadata.disclaimerVersion === "string";
}

export function secondOpinionDisplayState(opinion: SecondOpinion): SecondOpinionDisplayState {
  const status: unknown = (opinion as { status?: unknown }).status;

  switch (status) {
    case "pending":
      return { kind: "pending" };
    case "running":
      return { kind: "running" };
    case "succeeded":
      if (!isSecondOpinionResult(opinion.result) || !isSecondOpinionMetadata(opinion.metadata)) {
        return { kind: "unsupported" };
      }
      return { kind: "succeeded", metadata: opinion.metadata, result: opinion.result };
    case "failed":
      return { kind: "failed" };
    case "rejected":
      return typeof opinion.safeMessage === "string" && opinion.safeMessage.trim()
        ? { kind: "rejected", safeMessage: opinion.safeMessage }
        : { kind: "unsupported" };
    default:
      return { kind: "unsupported" };
  }
}

export function secondOpinionLoadError(error: unknown): SecondOpinionLoadError {
  if (error instanceof BeeexyApiError && error.status === 401) {
    return {
      clearExisting: true,
      kind: "session",
      message: "Your session has ended. Sign in again to view this Second Opinion.",
    };
  }
  if (error instanceof BeeexyApiError && error.status === 404) {
    return {
      clearExisting: true,
      kind: "unavailable",
      message: "This Second Opinion is unavailable.",
    };
  }
  if (error instanceof BeeexyNetworkError) {
    return {
      clearExisting: false,
      kind: "network",
      message: "We couldn’t reach Beeexy. Check your connection and try again.",
    };
  }
  return {
    clearExisting: false,
    kind: "server",
    message: "We couldn’t load this Second Opinion right now.",
  };
}

export function canRegenerateSecondOpinion(display: SecondOpinionDisplayState) {
  return display.kind === "succeeded" || display.kind === "failed" || display.kind === "rejected";
}

export function secondOpinionRegenerationError(error: unknown): SecondOpinionRegenerationError {
  const errorCode = error instanceof BeeexyApiError ? error.problem?.errorCode : undefined;

  if (error instanceof BeeexyApiError && error.status === 401) {
    return {
      blockRegeneration: true,
      canCheckStatus: false,
      clearExisting: true,
      kind: "session",
      message: "Your session has ended. Sign in again to view this Second Opinion.",
    };
  }
  if (error instanceof BeeexyApiError && error.status === 404) {
    return {
      blockRegeneration: true,
      canCheckStatus: false,
      clearExisting: true,
      kind: "unavailable",
      message: "This Second Opinion is unavailable.",
    };
  }
  if (error instanceof BeeexyApiError
    && error.status === 409
    && errorCode === "ai.second_opinion.execution_conflict") {
    return {
      blockRegeneration: true,
      canCheckStatus: true,
      clearExisting: false,
      kind: "conflict",
      message: "A regeneration is already in progress. Check the current status before trying again.",
    };
  }
  if (error instanceof BeeexyApiError
    && error.status === 422
    && errorCode === "ai.second_opinion.immutable_input_invalid") {
    return {
      blockRegeneration: true,
      canCheckStatus: false,
      clearExisting: false,
      kind: "immutable-input",
      message: "Beeexy can’t regenerate this Second Opinion from its original information.",
    };
  }
  if (error instanceof BeeexyApiError
    && error.status === 422
    && errorCode === "ai.second_opinion.regeneration_body_not_allowed") {
    return {
      blockRegeneration: true,
      canCheckStatus: false,
      clearExisting: false,
      kind: "request-invalid",
      message: "Beeexy couldn't accept this regeneration request.",
    };
  }
  if (error instanceof BeeexyNetworkError) {
    return {
      blockRegeneration: true,
      canCheckStatus: true,
      clearExisting: false,
      kind: "ambiguous",
      message: "We couldn’t confirm whether regeneration started. Check the current status before trying again.",
    };
  }
  return {
    blockRegeneration: error instanceof BeeexyApiError && error.status >= 500,
    canCheckStatus: error instanceof BeeexyApiError && error.status >= 500,
    clearExisting: false,
    kind: "server",
    message: "Beeexy couldn’t regenerate this Second Opinion right now.",
  };
}

export function formatSecondOpinionResultDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
