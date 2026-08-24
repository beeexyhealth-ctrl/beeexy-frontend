import type { ClinicalHistoryItem } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export function appendUniqueHistoryItems(current: ClinicalHistoryItem[], incoming: ClinicalHistoryItem[]) {
  const known = new Set(current.map((item) => item.eventId));
  return [...current, ...incoming.filter((item) => !known.has(item.eventId))];
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function isInvalidHistoryCursor(error: unknown) {
  return error instanceof BeeexyApiError
    && error.status === 422
    && error.problem?.errorCode === "clinical_history.cursor_invalid";
}

export function historyErrorMessage(error: unknown) {
  if (error instanceof BeeexyApiError && error.status === 404) return "This record is no longer available.";
  if (error instanceof BeeexyApiError && error.status === 401) return "Your session has ended. Sign in again to continue.";
  if (isInvalidHistoryCursor(error)) return "We couldn’t continue this timeline. Reload it from the newest record.";
  if (error instanceof BeeexyNetworkError) return "We couldn’t reach Beeexy. Check your connection and try again.";
  return "We couldn’t load Clinical History right now.";
}

export function amendmentErrorMessage(error: unknown) {
  if (error instanceof BeeexyApiError && error.status === 422) {
    if (error.problem?.errorCode === "clinical_amendment.invalid_reason") {
      return error.problem.detail || "Enter a reason for this correction.";
    }
    return "Check the correction and try again.";
  }
  if (error instanceof BeeexyApiError && error.status === 409) {
    return "This submission was already processed or conflicted. The record has been refreshed.";
  }
  if (error instanceof BeeexyApiError && error.status === 404) return "This record is no longer available.";
  if (error instanceof BeeexyApiError && error.status === 401) return "Your session has ended. Sign in again to continue.";
  if (error instanceof BeeexyNetworkError || (error instanceof BeeexyApiError && error.status >= 500)) {
    return "We couldn’t confirm whether the correction was saved. Retry when you’re ready; Beeexy will reuse this submission safely.";
  }
  return "We couldn’t add this correction right now.";
}
