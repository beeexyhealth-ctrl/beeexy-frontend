import type {
  AppointmentListQuery,
  AppointmentModality,
  AppointmentStatus,
  AppointmentSummary,
} from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export const APPOINTMENT_PAGE_SIZE = 20;

export type AppointmentScope = "upcoming" | "history" | "all";

export const APPOINTMENT_SCOPE_LABELS: Record<AppointmentScope, string> = {
  upcoming: "Upcoming",
  history: "History",
  all: "All",
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  Requested: "Pending confirmation",
  Confirmed: "Confirmed",
  Cancelled: "Cancelled",
  Completed: "Completed",
  NoShow: "No-show",
  Rejected: "Declined",
};

export const APPOINTMENT_MODALITY_LABELS: Record<AppointmentModality, string> = {
  inPerson: "In-person visit",
  virtual: "Virtual visit",
};

export function buildAppointmentListQuery(
  patientId: string,
  scope: AppointmentScope,
  boundary: string,
  cursor?: string,
): AppointmentListQuery {
  const query: AppointmentListQuery = { patientId, pageSize: APPOINTMENT_PAGE_SIZE };
  if (scope === "upcoming") query.from = boundary;
  if (scope === "history") query.to = boundary;
  if (cursor !== undefined) query.cursor = cursor;
  return query;
}

export function appointmentMatchesScope(
  appointment: AppointmentSummary,
  scope: AppointmentScope,
  boundary: string,
) {
  if (scope === "all") return true;
  const startsAt = Date.parse(appointment.startsAt);
  const boundaryInstant = Date.parse(boundary);
  if (scope === "history") return startsAt < boundaryInstant;
  return startsAt >= boundaryInstant
    && (appointment.status === "Requested" || appointment.status === "Confirmed");
}

export function appendUniqueAppointments(
  current: AppointmentSummary[],
  incoming: AppointmentSummary[],
) {
  const known = new Set(current.map((appointment) => appointment.appointmentId));
  const uniqueIncoming: AppointmentSummary[] = [];
  for (const appointment of incoming) {
    if (known.has(appointment.appointmentId)) continue;
    known.add(appointment.appointmentId);
    uniqueIncoming.push(appointment);
  }
  return [...current, ...uniqueIncoming];
}

export function isAppointmentAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function isInvalidAppointmentCursor(error: unknown) {
  return error instanceof BeeexyApiError
    && error.status === 422
    && error.problem?.errorCode === "scheduling.appointment_cursor_invalid";
}

export function appointmentListErrorMessage(error: unknown) {
  if (error instanceof BeeexyApiError && error.status === 401) {
    return "Your session has ended. Sign in again to continue.";
  }
  if (error instanceof BeeexyApiError && error.status === 404) {
    return "This patient profile is no longer available.";
  }
  if (isInvalidAppointmentCursor(error)) {
    return "We couldn’t continue this list. Reload it from the beginning.";
  }
  if (error instanceof BeeexyApiError && error.status === 422) {
    return "We couldn’t apply this appointment view. Reload the list and try again.";
  }
  if (error instanceof BeeexyNetworkError) {
    return "We couldn’t reach Beeexy. Check your connection and try again.";
  }
  return "We couldn’t load appointments right now.";
}

type AppointmentDateTime = {
  date: string;
  time: string;
  timeZone: string;
};

export function formatAppointmentDateTime(
  appointment: Pick<AppointmentSummary, "startsAt" | "endsAt" | "clinicTimeZone">,
  locale = "en-US",
): AppointmentDateTime {
  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  let timeZone = appointment.clinicTimeZone;

  try {
    new Intl.DateTimeFormat(locale, { timeZone }).format(start);
  } catch {
    timeZone = "UTC";
  }

  const date = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(start);
  const startTime = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(start);
  const endTime = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(end);

  return { date, time: `${startTime} – ${endTime}`, timeZone };
}
