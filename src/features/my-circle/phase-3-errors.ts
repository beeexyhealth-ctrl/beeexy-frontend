import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";
import type { PatientDetail } from "@/lib/beeexy-api/contracts";
import type { DemographicField } from "./forms";

const FIELD_BY_CODE: Record<string, DemographicField> = {
  "patient.invalid_first_name": "firstName",
  "patient.invalid_last_name": "lastName",
  "patient.invalid_date_of_birth": "dateOfBirth",
  "patient.invalid_sex_assigned_at_birth": "sexAssignedAtBirth",
  "patient.invalid_state": "state",
};

export class PatientConcurrencyError extends BeeexyApiError {
  constructor(readonly latest: PatientDetail) {
    super(409);
    this.name = "PatientConcurrencyError";
  }
}

export function fieldForPhase3Error(error: unknown) {
  if (!(error instanceof BeeexyApiError) || !error.problem?.errorCode) return null;
  return FIELD_BY_CODE[error.problem.errorCode] ?? null;
}

export function phase3ErrorMessage(error: unknown, context: "create" | "load" | "revoke" | "update") {
  if (error instanceof BeeexyNetworkError) return "We couldn’t reach Beeexy. Check your connection and try again.";
  if (!(error instanceof BeeexyApiError)) return "Something went wrong. Please try again.";
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 404) return "This profile is no longer available.";
  if (error.status === 409 && context === "update") return "This profile was updated elsewhere. We’ve loaded the latest information.";
  if (error.status === 409 && context === "create") return "We couldn’t add this person because the server state changed. Review My Circle and try again.";
  if (error.status === 422) return "Review the highlighted information and try again.";
  if (context === "revoke") return "We couldn’t remove this person from My Circle. Please try again.";
  if (context === "load") return "We couldn’t load this profile. Please try again.";
  return "We couldn’t save these changes. Please try again.";
}
