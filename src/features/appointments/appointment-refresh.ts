export const APPOINTMENT_LIST_REFRESH_EVENT = "beeexy:appointment-list-refresh";
export const DOCTOR_AVAILABILITY_REFRESH_EVENT = "beeexy:doctor-availability-refresh";

export function notifyAppointmentListChanged(patientId?: string) {
  if (typeof window === "undefined" || !patientId) return;
  window.dispatchEvent(new CustomEvent(APPOINTMENT_LIST_REFRESH_EVENT, { detail: { patientId } }));
}

export function notifyDoctorAvailabilityChanged(doctorId?: string) {
  if (typeof window === "undefined" || !doctorId) return;
  window.dispatchEvent(new CustomEvent(DOCTOR_AVAILABILITY_REFRESH_EVENT, { detail: { doctorId } }));
}

export function appointmentListRefreshPatientId(event: Event) {
  return event instanceof CustomEvent && typeof event.detail?.patientId === "string"
    ? event.detail.patientId
    : null;
}

export function doctorAvailabilityRefreshDoctorId(event: Event) {
  return event instanceof CustomEvent && typeof event.detail?.doctorId === "string"
    ? event.detail.doctorId
    : null;
}
