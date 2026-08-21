import type { AccessiblePatient, CurrentPatient, PatientDemographics, PatientDetail, UpdatePatientRequest } from "@/lib/beeexy-api/contracts";
import type { DemographicsDraft } from "./forms";

export function isPrimaryProfileComplete(patient: Pick<CurrentPatient, "firstName" | "lastName" | "dateOfBirth" | "sexAssignedAtBirth" | "state">) {
  return patient.firstName != null
    && patient.lastName != null
    && patient.dateOfBirth != null
    && patient.sexAssignedAtBirth != null
    && patient.state != null;
}

export function resolveActivePatient(patients: AccessiblePatient[], storedProfileId: string | null) {
  if (!patients.length) return null;
  return patients.find((patient) => patient.profileId === storedProfileId)
    ?? patients.find((patient) => patient.accessType === "Primary")
    ?? patients[0];
}

export function displayPatientName(patient: Pick<AccessiblePatient | PatientDetail, "firstName" | "lastName">) {
  const name = [patient.firstName, patient.lastName].filter(Boolean).join(" ");
  return name || "Incomplete profile";
}

export function initialsForPatient(patient: Pick<AccessiblePatient | PatientDetail, "firstName" | "lastName">) {
  const initials = `${patient.firstName?.charAt(0) || ""}${patient.lastName?.charAt(0) || ""}`.toUpperCase();
  return initials || "B";
}

export function detailToCurrentPatient(detail: PatientDetail, current: CurrentPatient): CurrentPatient {
  return {
    ...current,
    ...detail,
    profileVersion: detail.version,
    version: current.version,
    preferences: current.preferences,
  };
}

export function primaryCompletionPatch(current: CurrentPatient, demographics: PatientDemographics): UpdatePatientRequest {
  return { ...demographics, version: current.profileVersion };
}

export function buildPatientPatch(detail: PatientDetail, next: DemographicsDraft): UpdatePatientRequest {
  const patch: UpdatePatientRequest = { version: detail.version };
  if (next.firstName.trim() !== detail.firstName) patch.firstName = next.firstName.trim();
  if (next.lastName.trim() !== detail.lastName) patch.lastName = next.lastName.trim();
  if (next.dateOfBirth !== detail.dateOfBirth) patch.dateOfBirth = next.dateOfBirth;
  if (next.sexAssignedAtBirth !== detail.sexAssignedAtBirth && next.sexAssignedAtBirth) patch.sexAssignedAtBirth = next.sexAssignedAtBirth;
  if (next.state !== detail.state) patch.state = next.state;
  return patch;
}
