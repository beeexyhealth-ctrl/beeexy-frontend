export const ACTIVE_PATIENT_STORAGE_PREFIX = "beeexy:active-patient:";
export const CARE_CHOICE_STORAGE_PREFIX = "beeexy:care-choice:";

function storageKey(prefix: string, primaryProfileId: string) {
  return `${prefix}${primaryProfileId}`;
}

export function readActivePatientId(primaryProfileId: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(storageKey(ACTIVE_PATIENT_STORAGE_PREFIX, primaryProfileId));
}

export function writeActivePatientId(primaryProfileId: string, activeProfileId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(ACTIVE_PATIENT_STORAGE_PREFIX, primaryProfileId), activeProfileId);
}

export function hasCompletedCareChoice(primaryProfileId: string) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(storageKey(CARE_CHOICE_STORAGE_PREFIX, primaryProfileId)) === "true";
}

export function completeCareChoice(primaryProfileId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(CARE_CHOICE_STORAGE_PREFIX, primaryProfileId), "true");
}

export function clearPatientPreferences(primaryProfileId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(ACTIVE_PATIENT_STORAGE_PREFIX, primaryProfileId));
  window.localStorage.removeItem(storageKey(CARE_CHOICE_STORAGE_PREFIX, primaryProfileId));
}
