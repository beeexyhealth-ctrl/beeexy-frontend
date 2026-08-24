export const CLINICAL_HISTORY_REFRESH_EVENT = "beeexy:clinical-history-refresh";

export function notifyClinicalHistoryChanged(patientId?: string) {
  if (typeof window === "undefined" || !patientId) return;
  window.dispatchEvent(new CustomEvent(CLINICAL_HISTORY_REFRESH_EVENT, { detail: { patientId } }));
}

export function clinicalHistoryRefreshPatientId(event: Event) {
  return event instanceof CustomEvent && typeof event.detail?.patientId === "string"
    ? event.detail.patientId
    : null;
}
