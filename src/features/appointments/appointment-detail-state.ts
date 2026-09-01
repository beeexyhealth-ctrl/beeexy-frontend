import type {
  AppointmentHistoryActorType,
  AppointmentStatusAction,
} from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export const APPOINTMENT_STATUS_ACTION_LABELS: Record<AppointmentStatusAction, string> = {
  creation: "Appointment requested",
  confirmation: "Appointment confirmed",
  rejection: "Appointment declined",
  cancellation: "Appointment cancelled",
  completion: "Appointment completed",
  noShow: "Marked as no-show",
};

export const APPOINTMENT_HISTORY_ACTOR_LABELS: Record<AppointmentHistoryActorType, string> = {
  patientAuthority: "Patient or manager",
  appointmentScheduler: "Clinic scheduler",
};

export function isAppointmentDetailNotFound(error: unknown) {
  return error instanceof BeeexyApiError && error.status === 404;
}

export function appointmentDetailErrorMessage(error: unknown) {
  if (error instanceof BeeexyApiError && error.status === 401) {
    return "Your session has ended. Sign in again to continue.";
  }
  if (error instanceof BeeexyNetworkError) {
    return "We couldn’t reach Beeexy. Check your connection and try again.";
  }
  return "We couldn’t load this appointment right now.";
}
