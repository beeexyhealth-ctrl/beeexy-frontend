// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicRoute } from "@/features/auth/auth-route-boundary";
import { AppointmentDetailView } from "@/features/appointments/appointment-detail-view";
import { AppointmentSummaryCard } from "@/features/appointments/appointments-view";
import type { AccessiblePatient, AppointmentDetail, AppointmentSummary } from "@/lib/beeexy-api/contracts";
import { beeexyPhase7Api } from "@/lib/beeexy-api/phase-7-api";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const provider = vi.hoisted(() => ({
  activePatient: null as AccessiblePatient | null,
  patients: [] as AccessiblePatient[],
}));

vi.mock("@/features/my-circle/patient-provider", () => ({
  usePatients: () => ({ activePatient: provider.activePatient, patients: provider.patients }),
}));

const primaryPatient: AccessiblePatient = {
  profileId: "31000000-0000-4000-8000-000000000001",
  beeexyId: "BXY-PRIMARY",
  firstName: "Avery",
  lastName: "Patient",
  accessType: "Primary",
  relationship: null,
};

const detail: AppointmentDetail = {
  appointmentId: "94000000-0000-4000-8000-000000000001",
  patientId: primaryPatient.profileId,
  slotId: "82000000-0000-4000-8000-000000000001",
  doctorId: "71030000-0000-4000-8000-000000000001",
  clinicId: "71020000-0000-4000-8000-000000000001",
  locationId: "71021000-0000-4000-8000-000000000001",
  status: "Confirmed",
  modality: "inPerson",
  startsAt: "2026-09-10T14:00:00Z",
  endsAt: "2026-09-10T14:30:00Z",
  clinicTimeZone: "America/Lima",
  reason: "Follow-up visit\nBring prior records.",
  createdAt: "2026-09-01T18:00:00Z",
  statusHistory: [
    {
      sequence: 1,
      previousStatus: null,
      newStatus: "Requested",
      actorType: "patientAuthority",
      action: "creation",
      occurredAt: "2026-09-01T18:00:00Z",
    },
    {
      sequence: 2,
      previousStatus: "Requested",
      newStatus: "Confirmed",
      actorType: "appointmentScheduler",
      action: "confirmation",
      occurredAt: "2026-09-01T18:05:00Z",
    },
  ],
  rescheduleHistory: [
    {
      previousSlotId: "82000000-0000-4000-8000-000000000002",
      newSlotId: "82000000-0000-4000-8000-000000000001",
      occurredAt: "2026-09-01T18:03:00Z",
    },
  ],
};

function summary(): AppointmentSummary {
  return {
    appointmentId: detail.appointmentId,
    patientId: detail.patientId,
    slotId: detail.slotId,
    doctorId: detail.doctorId,
    clinicId: detail.clinicId,
    locationId: detail.locationId,
    status: detail.status,
    modality: detail.modality,
    startsAt: detail.startsAt,
    endsAt: detail.endsAt,
    clinicTimeZone: detail.clinicTimeZone,
    createdAt: detail.createdAt,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => { resolve = promiseResolve; });
  return { promise, resolve };
}

beforeEach(() => {
  provider.activePatient = primaryPatient;
  provider.patients = [primaryPatient];
  vi.spyOn(beeexyPhase8Api, "getAppointment").mockResolvedValue(detail);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Phase 8.4 appointment detail", () => {
  it("keeps the dynamic route authenticated and links list cards with the exact appointment ID", () => {
    expect(isPublicRoute(`/appointments/${detail.appointmentId}`)).toBe(false);
    render(<AppointmentSummaryCard appointment={summary()} />);
    expect(screen.getByRole("link", { name: /view appointment on/i })).toHaveAttribute(
      "href",
      `/appointments/${detail.appointmentId}`,
    );
    expect(screen.getByRole("link", { name: /doctor profile/i })).toHaveAttribute("href", `/doctors/${detail.doctorId}`);
    expect(screen.getByRole("link", { name: /clinic details/i })).toHaveAttribute("href", `/clinics/${detail.clinicId}`);
  });

  it("fetches the exact route ID with AbortSignal and renders current scheduling information", async () => {
    render(<AppointmentDetailView appointmentId={detail.appointmentId} />);
    expect(screen.getByRole("status", { name: /loading appointment details/i })).toBeInTheDocument();

    expect(await screen.findByRole("heading", { level: 2, name: "Thursday, September 10, 2026" })).toBeInTheDocument();
    expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledWith(detail.appointmentId, expect.any(AbortSignal));
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("In-person visit").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9:00 AM – 9:30 AM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("America/Lima").length).toBeGreaterThan(0);
    expect(screen.getByText("Avery Patient")).toBeInTheDocument();
  });

  it("renders booked doctor, clinic, and location references without depending on public directory fetches", async () => {
    const doctorLookup = vi.spyOn(beeexyPhase7Api, "getDoctor");
    const clinicLookup = vi.spyOn(beeexyPhase7Api, "getClinic");
    render(<AppointmentDetailView appointmentId={detail.appointmentId} />);

    expect(await screen.findByText("Booked doctor profile")).toBeInTheDocument();
    expect(screen.getByText("Booked clinic details")).toBeInTheDocument();
    expect(screen.getByText("Booked location")).toBeInTheDocument();
    expect(screen.getByText(/remains readable even if a public directory listing changes/i)).toBeInTheDocument();
    expect(doctorLookup).not.toHaveBeenCalled();
    expect(clinicLookup).not.toHaveBeenCalled();
  });

  it("renders an optional reason as plain text and omits the section when absent", async () => {
    const unsafeReason = "<img src=x onerror=alert(1)>\nPlain patient text";
    vi.mocked(beeexyPhase8Api.getAppointment).mockResolvedValueOnce({ ...detail, reason: unsafeReason });
    const view = render(<AppointmentDetailView appointmentId={detail.appointmentId} />);
    expect(await screen.findByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(view.container.querySelector("img")).toBeNull();

    cleanup();
    vi.mocked(beeexyPhase8Api.getAppointment).mockResolvedValueOnce({ ...detail, reason: undefined });
    render(<AppointmentDetailView appointmentId="appointment-without-reason" />);
    await screen.findByText("Booked doctor profile");
    expect(screen.queryByRole("heading", { name: "Reason for visit" })).not.toBeInTheDocument();
  });

  it("renders the complete backend-ordered status history without adding events", async () => {
    render(<AppointmentDetailView appointmentId={detail.appointmentId} />);
    const timeline = await screen.findByRole("list", { name: "Appointment status history" });
    const events = within(timeline).getAllByRole("listitem");
    expect(events).toHaveLength(2);
    expect(events[0]).toHaveTextContent("Appointment requested");
    expect(events[0]).toHaveTextContent("Pending confirmation");
    expect(events[0]).toHaveTextContent("Patient or manager");
    expect(events[1]).toHaveTextContent("Appointment confirmed");
    expect(events[1]).toHaveTextContent("Clinic scheduler");
    expect(events[0].compareDocumentPosition(events[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders reschedule history separately without inventing a status or historical times", async () => {
    render(<AppointmentDetailView appointmentId={detail.appointmentId} />);
    const scheduleChanges = await screen.findByRole("list", { name: "Appointment schedule changes" });
    expect(within(scheduleChanges).getAllByRole("listitem")).toHaveLength(1);
    expect(within(scheduleChanges).getByText("Schedule changed")).toBeInTheDocument();
    expect(screen.queryByText("Rescheduled")).not.toBeInTheDocument();
    expect(screen.queryByText(detail.rescheduleHistory[0].previousSlotId)).not.toBeInTheDocument();
    expect(screen.queryByText(detail.rescheduleHistory[0].newSlotId)).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Schedule changes" })).getByText(/America\/Lima/)).toBeInTheDocument();
  });

  it("shows neutral empty history copy without fabricating records", async () => {
    vi.mocked(beeexyPhase8Api.getAppointment).mockResolvedValueOnce({ ...detail, statusHistory: [], rescheduleHistory: [] });
    render(<AppointmentDetailView appointmentId={detail.appointmentId} />);
    expect(await screen.findByText("No status history is available.")).toBeInTheDocument();
    expect(screen.getByText("This appointment has not been moved.")).toBeInTheDocument();
    expect(screen.queryByText("Appointment requested")).not.toBeInTheDocument();
  });

  it("uses a safe patient label if accessible profiles have not supplied the matching projection", async () => {
    provider.patients = [];
    render(<AppointmentDetailView appointmentId={detail.appointmentId} />);
    expect(await screen.findByText("Authorized patient profile")).toBeInTheDocument();
    expect(screen.queryByText(detail.patientId)).not.toBeInTheDocument();
  });

  it("shows concealed 404 UX without revealing authorization information", async () => {
    vi.mocked(beeexyPhase8Api.getAppointment).mockRejectedValueOnce(new BeeexyApiError(404, {
      problem: { errorCode: "scheduling.appointment_target_not_found" },
    }));
    render(<AppointmentDetailView appointmentId="concealed-appointment" />);
    expect(await screen.findByRole("heading", { name: "Appointment not found" })).toBeInTheDocument();
    expect(screen.getByText(/can’t distinguish a missing appointment/i)).toBeInTheDocument();
    expect(screen.queryByText(/belongs to another patient/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Back to My Appointments" })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: "Back to My Appointments" })) {
      expect(link).toHaveAttribute("href", "/appointments");
    }
  });

  it("shows safe 401 and generic network/500 errors with retry", async () => {
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockRejectedValueOnce(new BeeexyApiError(401))
      .mockRejectedValueOnce(new BeeexyNetworkError())
      .mockRejectedValueOnce(new BeeexyApiError(500))
      .mockResolvedValueOnce(detail);
    const view = render(<AppointmentDetailView appointmentId="session-ended" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("session has ended");

    view.rerender(<AppointmentDetailView appointmentId="network-error" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Check your connection");
    view.rerender(<AppointmentDetailView appointmentId="server-error" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("load this appointment right now");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Booked doctor profile")).toBeInTheDocument();
  });

  it("hides appointment A immediately and prevents its stale response from overwriting B", async () => {
    const requestA = deferred<AppointmentDetail>();
    const requestB = deferred<AppointmentDetail>();
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockImplementationOnce(() => requestA.promise)
      .mockImplementationOnce(() => requestB.promise);
    const view = render(<AppointmentDetailView appointmentId="appointment-a" />);
    await waitFor(() => expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledTimes(1));

    view.rerender(<AppointmentDetailView appointmentId="appointment-b" />);
    expect(screen.getByRole("status", { name: /loading appointment details/i })).toBeInTheDocument();
    await waitFor(() => expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledTimes(2));
    requestB.resolve({ ...detail, appointmentId: "appointment-b", reason: "Appointment B reason" });
    expect(await screen.findByText("Appointment B reason")).toBeInTheDocument();

    requestA.resolve({ ...detail, appointmentId: "appointment-a", reason: "Stale appointment A reason" });
    await Promise.resolve();
    expect(screen.queryByText("Stale appointment A reason")).not.toBeInTheDocument();
    expect(screen.getByText("Appointment B reason")).toBeInTheDocument();
  });

  it("does not show a false error when an obsolete request is aborted", async () => {
    vi.mocked(beeexyPhase8Api.getAppointment).mockImplementation((appointmentId, signal) => new Promise((resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      if (appointmentId === "appointment-b") resolve({ ...detail, appointmentId });
    }));
    const view = render(<AppointmentDetailView appointmentId="appointment-a" />);
    await waitFor(() => expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledTimes(1));
    view.rerender(<AppointmentDetailView appointmentId="appointment-b" />);
    expect(await screen.findByText("Booked doctor profile")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not render internal or clinical fields from an expanded payload", async () => {
    vi.mocked(beeexyPhase8Api.getAppointment).mockResolvedValueOnce({
      ...detail,
      idempotencyKey: "internal-secret",
      fingerprint: "backend-fingerprint",
      version: 42,
      schedulerId: "scheduler-internal",
      triageUrgency: "urgent",
      diagnosis: "private diagnosis",
    } as AppointmentDetail);
    render(<AppointmentDetailView appointmentId={detail.appointmentId} />);
    await screen.findByText("Booked doctor profile");
    for (const value of ["internal-secret", "backend-fingerprint", "42", "scheduler-internal", "urgent", "private diagnosis"]) {
      expect(screen.queryByText(value)).not.toBeInTheDocument();
    }
  });

  it("provides logical headings, textual status, semantic histories, and accessible back navigation", async () => {
    render(<AppointmentDetailView appointmentId={detail.appointmentId} />);
    expect(screen.getByRole("heading", { level: 1, name: "Appointment details" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Status history" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Schedule changes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to My Appointments" })).toHaveAttribute("href", "/appointments");
    expect(screen.getByText("Pending confirmation")).toBeInTheDocument();
  });
});
