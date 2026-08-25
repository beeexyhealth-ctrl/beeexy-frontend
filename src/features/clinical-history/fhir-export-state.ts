import type { FhirExportMetadata } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export const CURRENT_FHIR_VERSION = "4.0.1";
export const CURRENT_FHIR_MAPPING_VERSION = "beeexy-fhir-r4-base-mvp-v1";

export type FhirExportRetry = "fresh" | "none" | "same";

export interface FhirExportErrorPresentation {
  correlationId?: string;
  message: string;
  retry: FhirExportRetry;
}

export function isFhirExportDownloadCandidate(metadata: FhirExportMetadata) {
  return metadata.status === "Validated"
    && metadata.fhirVersion === CURRENT_FHIR_VERSION
    && metadata.mappingVersion === CURRENT_FHIR_MAPPING_VERSION;
}

export function createFhirExportErrorPresentation(error: unknown): FhirExportErrorPresentation {
  if (error instanceof BeeexyApiError) {
    if (error.status === 401) return withReference("Your session has ended. Sign in again to continue.", "none", error);
    if (error.status === 409) return withReference("We couldn’t prepare this export. Start a new export when you’re ready.", "fresh", error);
    if (error.status === 422) return withReference("We couldn’t prepare this health data export. Please try again.", "fresh", error);
    if (error.status === 503) return withReference("Health data export is temporarily unavailable. Try again later.", "same", error);
    if (error.status >= 500) return withReference("The export couldn’t be processed safely. Please try again.", "same", error);
    if (error.status === 400) return withReference("We couldn’t prepare this health data export.", "none", error);
  }
  if (error instanceof BeeexyNetworkError) {
    return { message: "We couldn’t confirm whether the export was created. Check your connection and try again.", retry: "same" };
  }
  return { message: "We couldn’t prepare this health data export right now.", retry: "none" };
}

export function downloadFhirExportErrorPresentation(error: unknown): FhirExportErrorPresentation {
  if (error instanceof BeeexyApiError) {
    if (error.status === 401) return withReference("Your session has ended. Sign in again to continue.", "none", error);
    if (error.status === 409) return withReference("This export isn’t available for download.", "none", error);
    if (error.status === 503) return withReference("The download is temporarily unavailable. Try again later.", "same", error);
    if (error.status >= 500) return withReference("The export couldn’t be downloaded safely.", "none", error);
  }
  if (error instanceof BeeexyNetworkError) {
    return { message: "We couldn’t download the export. Check your connection and try again.", retry: "same" };
  }
  return { message: "We couldn’t download the export right now.", retry: "none" };
}

export function formatFhirExportDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function withReference(message: string, retry: FhirExportRetry, error: BeeexyApiError) {
  return { message, retry, correlationId: error.correlationId };
}
