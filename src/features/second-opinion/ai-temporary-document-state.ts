import type { AiDocument } from "@/lib/beeexy-api/contracts";
import {
  AI_DOCUMENT_MAX_SIZE_BYTES,
  AI_DOCUMENT_SUPPORTED_MEDIA_TYPES,
} from "@/lib/beeexy-api/phase-10-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export const AI_DOCUMENT_ACCEPT_ATTRIBUTE = [
  ".pdf",
  ".txt",
  ...AI_DOCUMENT_SUPPORTED_MEDIA_TYPES,
].join(",");

export type AiDocumentSelectionValidation =
  | { valid: true; file: File }
  | { valid: false; message: string };

export function validateAiDocumentSelection(files: FileList | readonly File[] | null) : AiDocumentSelectionValidation {
  if (!files || files.length === 0) {
    return { valid: false, message: "Select one text-based PDF or UTF-8 TXT file." };
  }
  if (files.length !== 1) {
    return { valid: false, message: "Choose only one document at a time." };
  }

  const file = files[0];
  if (file.size > AI_DOCUMENT_MAX_SIZE_BYTES) {
    return { valid: false, message: "This file is larger than 25 MiB. Choose a smaller file." };
  }

  const name = file.name.trim().toLowerCase();
  const expectedType = name.endsWith(".pdf")
    ? "application/pdf"
    : name.endsWith(".txt")
      ? "text/plain"
      : null;
  const declaredType = file.type.trim().toLowerCase();
  const ambiguousType = declaredType === "" || declaredType === "application/octet-stream";

  if (!expectedType || (!ambiguousType && declaredType !== expectedType)) {
    return {
      valid: false,
      message: "This file type isn’t supported. Upload a text-based PDF or UTF-8 TXT file.",
    };
  }

  return { valid: true, file };
}

export function formatAiDocumentSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return "Size unavailable";
  if (sizeBytes < 1024) return `${sizeBytes} ${sizeBytes === 1 ? "byte" : "bytes"}`;
  const units = ["KiB", "MiB", "GiB"];
  let value = sizeBytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

export function formatAiDocumentDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function aiDocumentTypeLabel(contentType: AiDocument["contentType"]) {
  return contentType === "application/pdf" ? "PDF" : "TXT";
}

export type AiDocumentUploadError = { message: string; retryable: boolean };

export function aiDocumentUploadError(error: unknown): AiDocumentUploadError {
  const code = error instanceof BeeexyApiError ? error.problem?.errorCode : undefined;

  if (error instanceof BeeexyApiError && error.status === 401) {
    return { message: "Your session has ended. Sign in again before uploading.", retryable: false };
  }
  if (error instanceof BeeexyApiError && error.status === 413) {
    return { message: "This file exceeds Beeexy’s 25 MiB upload limit. Choose a smaller file.", retryable: false };
  }
  if (error instanceof BeeexyApiError && error.status === 415) {
    return {
      message: "This file type isn’t supported. Upload a text-based PDF or UTF-8 TXT file.",
      retryable: false,
    };
  }
  if (error instanceof BeeexyApiError && error.status === 400) {
    return { message: "Beeexy couldn’t receive that file. Select it again and retry.", retryable: false };
  }
  if (error instanceof BeeexyApiError && error.status === 422) {
    if (code === "ai.document.unusable_text") {
      return {
        message: "Beeexy couldn’t read usable text from this file. Upload a text-based PDF or UTF-8 TXT file. Scanned PDFs aren’t supported.",
        retryable: false,
      };
    }
    if (code === "ai.document.file_unsafe") {
      return {
        message: "Beeexy couldn’t verify this document for safe use. Choose another PDF or TXT file.",
        retryable: false,
      };
    }
    if (code === "ai.document.single_file_required") {
      return { message: "Choose exactly one PDF or TXT file.", retryable: false };
    }
    if (code === "ai.document.empty" || code === "ai.document.size_mismatch") {
      return { message: "Beeexy couldn’t validate this file. Choose another PDF or TXT file.", retryable: false };
    }
    return { message: "Beeexy couldn’t use this document. Choose another PDF or TXT file.", retryable: false };
  }
  if (error instanceof BeeexyNetworkError || (error instanceof BeeexyApiError && error.status >= 500)) {
    return {
      message: "We couldn’t confirm whether the upload completed. Beeexy won’t retry automatically; review the file before trying again.",
      retryable: true,
    };
  }
  return { message: "Beeexy couldn’t upload this document right now.", retryable: true };
}

export function aiDocumentDeleteError(error: unknown) {
  if (error instanceof BeeexyApiError && error.status === 401) {
    return "Your session has ended. Sign in again before removing this document.";
  }
  if (error instanceof BeeexyNetworkError || (error instanceof BeeexyApiError && error.status >= 500)) {
    return "We couldn’t confirm the removal. The current document is still selected; check your connection and try again.";
  }
  return "Beeexy couldn’t remove this document. The current document is still selected.";
}
