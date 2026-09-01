import { describe, expect, it, vi } from "vitest";
import { BeeexyApiClient } from "@/lib/beeexy-api/api-client";
import type {
  AppointmentDetail,
  AppointmentSummary,
  AvailabilitySlot,
  Phase8ErrorCode,
  RequestAppointmentRequest,
} from "@/lib/beeexy-api/contracts";
import {
  BeeexyPhase8Api,
  createAppointmentIdempotencyKey,
} from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import type { BeeexySession, SessionStore } from "@/lib/beeexy-api/session-storage";

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const baseUrl = "http://localhost:5105";
const doctorId = "71030000-0000-4000-8000-000000000001";
const patientId = "31000000-0000-4000-8000-000000000001";
const slotId = "82000000-0000-4000-8000-000000000001";
const appointmentId = "94000000-0000-4000-8000-000000000001";
const idempotencyKey = "93000000-0000-4000-8000-000000000001";

const session: BeeexySession = {
  accessToken: "phase-8-access",
  refreshToken: "phase-8-refresh",
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
  account: { accountId: "account-1", profileId: patientId, beeexyId: "BXY-1" },
};

const slot: AvailabilitySlot = {
  slotId,
  doctorId,
  clinicId: "71020000-0000-4000-8000-000000000001",
  locationId: "71021000-0000-4000-8000-000000000001",
  startsAt: "2026-09-10T14:00:00+00:00",
  endsAt: "2026-09-10T14:30:00+00:00",
  clinicTimeZone: "America/Lima",
  modality: "inPerson",
};

const summary: AppointmentSummary = {
  appointmentId,
  patientId,
  slotId,
  doctorId,
  clinicId: slot.clinicId,
  locationId: slot.locationId,
  status: "Requested",
  modality: "inPerson",
  startsAt: slot.startsAt,
  endsAt: slot.endsAt,
  clinicTimeZone: slot.clinicTimeZone,
  createdAt: "2026-09-01T18:00:00+00:00",
};

const detail: AppointmentDetail = {
  ...summary,
  status: "Confirmed",
  reason: "Follow-up visit",
  statusHistory: [
    {
      sequence: 1,
      previousStatus: null,
      newStatus: "Requested",
      actorType: "patientAuthority",
      action: "creation",
      occurredAt: summary.createdAt,
    },
    {
      sequence: 2,
      previousStatus: "Requested",
      newStatus: "Confirmed",
      actorType: "appointmentScheduler",
      action: "confirmation",
      occurredAt: "2026-09-01T18:05:00+00:00",
    },
  ],
  rescheduleHistory: [
    {
      previousSlotId: "82000000-0000-4000-8000-000000000002",
      newSlotId: slotId,
      occurredAt: "2026-09-01T18:03:00+00:00",
    },
  ],
};

class MemoryStore implements SessionStore {
  constructor(private value: BeeexySession | null = session) {}
  clear() { this.value = null; }
  read() { return this.value; }
  write(next: BeeexySession) { this.value = next; }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createApi(fetcher: TestFetch, store = new MemoryStore()) {
  return new BeeexyPhase8Api(new BeeexyApiClient(baseUrl, store, fetcher));
}

function requestBody(fetcher: ReturnType<typeof vi.fn<TestFetch>>) {
  return JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as Record<string, unknown>;
}

describe("Beeexy Phase 8 API contract", () => {
  it("lists typed slots anonymously with exact ISO filters and AbortSignal", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json([slot]));
    const controller = new AbortController();

    await expect(createApi(fetcher).listDoctorSlots(
      doctorId,
      { from: "2026-09-01T00:00:00+00:00", to: "2026-09-15T00:00:00+00:00" },
      controller.signal,
    )).resolves.toEqual([slot]);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/doctors/${doctorId}/slots?from=2026-09-01T00%3A00%3A00%2B00%3A00&to=2026-09-15T00%3A00%3A00%2B00%3A00`);
    expect(init?.method).toBe("GET");
    expect(init?.signal).toBe(controller.signal);
    expect((init?.headers as Headers).get("Authorization")).toBeNull();
  });

  it("omits undefined availability filters", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json([]));

    await createApi(fetcher).listDoctorSlots("doctor/id", { from: undefined, to: undefined });

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/doctors/doctor%2Fid/slots`);
  });

  it.each([200, 201])("creates an appointment with the exact authenticated body and accepts %s", async (status) => {
    const response = { ...summary, reason: "Follow-up visit" };
    const fetcher = vi.fn<TestFetch>(async () => json(response, status));
    const controller = new AbortController();
    const request: RequestAppointmentRequest = {
      patientId,
      slotId,
      modality: "inPerson",
      reason: "Follow-up visit",
      idempotencyKey,
    };

    await expect(createApi(fetcher).createAppointment(request, controller.signal)).resolves.toEqual(response);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/appointments`);
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBe(controller.signal);
    expect(requestBody(fetcher)).toEqual(request);
    expect(Object.keys(requestBody(fetcher)).sort()).toEqual([
      "idempotencyKey",
      "modality",
      "patientId",
      "reason",
      "slotId",
    ]);
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer phase-8-access");
  });

  it("omits a null reason and generates booking UUIDs only through the explicit helper", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(summary, 201));
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(idempotencyKey);

    expect(createAppointmentIdempotencyKey()).toBe(idempotencyKey);
    await createApi(fetcher).createAppointment({
      patientId,
      slotId,
      modality: "inPerson",
      reason: null,
      idempotencyKey,
    });

    expect(requestBody(fetcher)).toEqual({ patientId, slotId, modality: "inPerson", idempotencyKey });
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("preserves normalized booking conflicts and their machine-readable code", async () => {
    const code = "scheduling.idempotency_key_reused" satisfies Phase8ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({
      title: "Conflict",
      status: 409,
      errorCode: code,
      correlationId: "phase-8-conflict",
    }, 409));

    const error = await createApi(fetcher).createAppointment({
      patientId,
      slotId,
      modality: "inPerson",
      idempotencyKey,
    }).catch((reason) => reason);

    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error).toMatchObject({
      status: 409,
      correlationId: "phase-8-conflict",
      problem: { errorCode: code },
    });
  });

  it("serializes appointment filters deterministically and preserves the opaque cursor", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json({ items: [summary], nextCursor: "next" }));
    const controller = new AbortController();

    await expect(createApi(fetcher).listAppointments({
      pageSize: 20,
      cursor: "opaque+/=? token",
      to: "2026-10-01T00:00:00+00:00",
      from: "2026-09-01T00:00:00+00:00",
      status: "Confirmed",
      patientId,
    }, controller.signal)).resolves.toEqual({ items: [summary], nextCursor: "next" });

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/appointments?patientId=${patientId}&status=Confirmed&from=2026-09-01T00%3A00%3A00%2B00%3A00&to=2026-10-01T00%3A00%3A00%2B00%3A00&cursor=opaque%2B%2F%3D%3F+token&pageSize=20`);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get("Authorization")).toBe("Bearer phase-8-access");
  });

  it("gets appointment detail without transforming either history stream", async () => {
    const fetcher = vi.fn<TestFetch>(async () => json(detail));
    const controller = new AbortController();

    await expect(createApi(fetcher).getAppointment("appointment/id", controller.signal)).resolves.toEqual(detail);

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/appointments/appointment%2Fid`);
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get("Authorization")).toBe("Bearer phase-8-access");
  });

  it("preserves concealed appointment 404 errors", async () => {
    const code = "scheduling.appointment_target_not_found" satisfies Phase8ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status: 404, errorCode: code }, 404));

    const error = await createApi(fetcher).getAppointment(appointmentId).catch((reason) => reason);

    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error).toMatchObject({ status: 404, problem: { errorCode: code } });
  });

  it.each([
    ["confirmAppointment", "confirm"],
    ["rejectAppointment", "reject"],
    ["cancelAppointment", "cancel"],
  ] as const)("%s posts to the exact authenticated action route without a body", async (method, action) => {
    const fetcher = vi.fn<TestFetch>(async () => json(summary));
    const controller = new AbortController();
    const api = createApi(fetcher);

    await api[method](appointmentId, controller.signal);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/appointments/${appointmentId}/${action}`);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBe(controller.signal);
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer phase-8-access");
    expect((init?.headers as Headers).get("Content-Type")).toBeNull();
  });

  it.each([
    ["confirmAppointment", 403, "scheduling.appointment_scheduler_forbidden"],
    ["rejectAppointment", 409, "scheduling.appointment_transition_conflict"],
    ["cancelAppointment", 409, "scheduling.appointment_transition_conflict"],
  ] as const)("%s preserves the %s Problem Details outcome", async (method, status, errorCode) => {
    const code = errorCode satisfies Phase8ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status, errorCode: code }, status));

    const error = await createApi(fetcher)[method](appointmentId).catch((reason) => reason);

    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error).toMatchObject({ status, problem: { errorCode: code } });
  });

  it("reschedules with only the authoritative target slot ID", async () => {
    const targetSlotId = "82000000-0000-4000-8000-000000000009";
    const response = { ...summary, slotId: targetSlotId };
    const fetcher = vi.fn<TestFetch>(async () => json(response));
    const controller = new AbortController();

    await expect(createApi(fetcher).rescheduleAppointment(
      appointmentId,
      { slotId: targetSlotId },
      controller.signal,
    )).resolves.toEqual(response);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/appointments/${appointmentId}/reschedule`);
    expect(init?.method).toBe("POST");
    expect(requestBody(fetcher)).toEqual({ slotId: targetSlotId });
    expect(init?.signal).toBe(controller.signal);
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer phase-8-access");
  });

  it.each([
    [409, "scheduling.slot_reserved"],
    [409, "scheduling.appointment_reschedule_conflict"],
    [422, "scheduling.slot_expired"],
  ] as const)("reschedule preserves the %s %s outcome", async (status, errorCode) => {
    const code = errorCode satisfies Phase8ErrorCode;
    const fetcher = vi.fn<TestFetch>(async () => json({ status, errorCode: code }, status));

    const error = await createApi(fetcher).rescheduleAppointment(
      appointmentId,
      { slotId },
    ).catch((reason) => reason);

    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error).toMatchObject({ status, problem: { errorCode: code } });
  });
});
