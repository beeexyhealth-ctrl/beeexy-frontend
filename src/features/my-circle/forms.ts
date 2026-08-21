import type { PatientDemographics, SexAssignedAtBirth } from "@/lib/beeexy-api/contracts";
import { US_STATES } from "./constants";

export type DemographicsDraft = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sexAssignedAtBirth: SexAssignedAtBirth | "";
  state: string;
};

export type DemographicField = keyof DemographicsDraft;
export type FieldErrors = Partial<Record<DemographicField, string>>;

export const EMPTY_DEMOGRAPHICS: DemographicsDraft = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  sexAssignedAtBirth: "",
  state: "",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATE_CODES = new Set<string>(US_STATES.map(([code]) => code));

function isIsoDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateDemographics(draft: DemographicsDraft, today = new Date().toISOString().slice(0, 10)) {
  const errors: FieldErrors = {};
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();

  if (!firstName) errors.firstName = "Enter a first name.";
  else if (firstName.length > 100) errors.firstName = "First name must be 100 characters or fewer.";
  if (!lastName) errors.lastName = "Enter a last name.";
  else if (lastName.length > 100) errors.lastName = "Last name must be 100 characters or fewer.";
  if (!isIsoDate(draft.dateOfBirth)) errors.dateOfBirth = "Enter a valid date of birth.";
  else if (draft.dateOfBirth > today) errors.dateOfBirth = "Date of birth cannot be in the future.";
  if (draft.sexAssignedAtBirth !== "Male" && draft.sexAssignedAtBirth !== "Female") {
    errors.sexAssignedAtBirth = "Select sex assigned at birth.";
  }
  if (!STATE_CODES.has(draft.state)) errors.state = "Select a valid state.";

  if (Object.keys(errors).length) return { errors, value: null };
  return {
    errors,
    value: {
      firstName,
      lastName,
      dateOfBirth: draft.dateOfBirth,
      sexAssignedAtBirth: draft.sexAssignedAtBirth as SexAssignedAtBirth,
      state: draft.state,
    } satisfies PatientDemographics,
  };
}
