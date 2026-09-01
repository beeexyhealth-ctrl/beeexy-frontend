import { BeeexyApiClient } from "./api-client";
import { beeexyApiClient } from "./auth-api";
import type {
  AppointmentDetail,
  AppointmentListQuery,
  AppointmentPage,
  AppointmentSummary,
  AvailabilityQuery,
  AvailabilitySlot,
  RequestAppointmentRequest,
  RequestAppointmentResponse,
  RescheduleAppointmentRequest,
  Uuid,
} from "./contracts";

function appendAvailabilityQuery(path: string, query: AvailabilityQuery) {
  const parameters = new URLSearchParams();
  if (query.from !== undefined) parameters.set("from", query.from);
  if (query.to !== undefined) parameters.set("to", query.to);
  return appendParameters(path, parameters);
}

function appendAppointmentListQuery(path: string, query: AppointmentListQuery) {
  const parameters = new URLSearchParams();
  if (query.patientId !== undefined) parameters.set("patientId", query.patientId);
  if (query.status !== undefined) parameters.set("status", query.status);
  if (query.from !== undefined) parameters.set("from", query.from);
  if (query.to !== undefined) parameters.set("to", query.to);
  if (query.cursor !== undefined) parameters.set("cursor", query.cursor);
  if (query.pageSize !== undefined) parameters.set("pageSize", String(query.pageSize));
  return appendParameters(path, parameters);
}

function appendParameters(path: string, parameters: URLSearchParams) {
  const encoded = parameters.toString();
  return encoded ? `${path}?${encoded}` : path;
}

function appointmentRequestBody(request: RequestAppointmentRequest): RequestAppointmentRequest {
  const body: RequestAppointmentRequest = {
    patientId: request.patientId,
    slotId: request.slotId,
    modality: request.modality,
    idempotencyKey: request.idempotencyKey,
  };

  if (request.reason !== undefined && request.reason !== null) body.reason = request.reason;
  return body;
}

export class BeeexyPhase8Api {
  constructor(private readonly client: BeeexyApiClient) {}

  listDoctorSlots(doctorId: Uuid, query: AvailabilityQuery = {}, signal?: AbortSignal) {
    const path = appendAvailabilityQuery(
      `/api/v1/doctors/${encodeURIComponent(doctorId)}/slots`,
      query,
    );
    return this.client.requestPublic<AvailabilitySlot[]>(path, { expectedStatus: 200, signal });
  }

  createAppointment(request: RequestAppointmentRequest, signal?: AbortSignal) {
    return this.client.requestAuthenticated<RequestAppointmentResponse>(
      "/api/v1/appointments",
      {
        method: "POST",
        body: appointmentRequestBody(request),
        expectedStatus: [200, 201],
        signal,
      },
    );
  }

  listAppointments(query: AppointmentListQuery = {}, signal?: AbortSignal) {
    return this.client.requestAuthenticated<AppointmentPage>(
      appendAppointmentListQuery("/api/v1/appointments", query),
      { expectedStatus: 200, signal },
    );
  }

  getAppointment(appointmentId: Uuid, signal?: AbortSignal) {
    return this.client.requestAuthenticated<AppointmentDetail>(
      `/api/v1/appointments/${encodeURIComponent(appointmentId)}`,
      { expectedStatus: 200, signal },
    );
  }

  confirmAppointment(appointmentId: Uuid, signal?: AbortSignal) {
    return this.appointmentAction(appointmentId, "confirm", signal);
  }

  rejectAppointment(appointmentId: Uuid, signal?: AbortSignal) {
    return this.appointmentAction(appointmentId, "reject", signal);
  }

  cancelAppointment(appointmentId: Uuid, signal?: AbortSignal) {
    return this.appointmentAction(appointmentId, "cancel", signal);
  }

  rescheduleAppointment(
    appointmentId: Uuid,
    request: RescheduleAppointmentRequest,
    signal?: AbortSignal,
  ) {
    return this.client.requestAuthenticated<AppointmentSummary>(
      `/api/v1/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
      { method: "POST", body: request, expectedStatus: 200, signal },
    );
  }

  private appointmentAction(
    appointmentId: Uuid,
    action: "confirm" | "reject" | "cancel",
    signal?: AbortSignal,
  ) {
    return this.client.requestAuthenticated<AppointmentSummary>(
      `/api/v1/appointments/${encodeURIComponent(appointmentId)}/${action}`,
      { method: "POST", expectedStatus: 200, signal },
    );
  }
}

export function createAppointmentIdempotencyKey(): Uuid {
  return globalThis.crypto.randomUUID();
}

export const beeexyPhase8Api = new BeeexyPhase8Api(beeexyApiClient);
