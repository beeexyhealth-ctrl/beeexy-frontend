// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canPatientCancelAppointment } from "@/features/appointments/appointment-detail-state";
import { AppointmentDetailView } from "@/features/appointments/appointment-detail-view";
import type {
  AccessiblePatient,
  AppointmentDetail,
  AppointmentStatus,
  AppointmentSummary,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const provider = vi.hoisted(() => ({
  patients: [] as AccessiblePatient[],
}));

vi.mock("@/features/my-circle/patient-provider", () => ({
  usePatients: () => ({ patients: provider.patients }),
}));

const patient: AccessiblePatient = {
  profileId: "31000000-0000-4000-8000-000000000001",
  beeexyId: "BXY-PRIMARY",
  firstName: "Avery",
  lastName: "Patient",
  accessType: "Primary",
  relationship: null,
};

const confirmedDetail: AppointmentDetail = {
  appointmentId: "94000000-0000-4000-8000-000000000001",
  patientId: patient.profileId,
  slotId: "82000000-0000-4000-8000-000000000001",
  doctorId: "71030000-0000-4000-8000-000000000001",
  clinicId: "71020000-0000-4000-8000-000000000001",
  locationId: "71021000-0000-4000-8000-000000000001",
  status: "Confirmed",
  modality: "inPerson",
  startsAt: "2026-09-10T14:00:00Z",
  endsAt: "2026-09-10T14:30:00Z",
  clinicTimeZone: "America/Lima",
  reason: "Follow-up visit",
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
  rescheduleHistory: [{
    previousSlotId: "82000000-0000-4000-8000-000000000002",
    newSlotId: "82000000-0000-4000-8000-000000000001",
    occurredAt: "2026-09-01T18:03:00Z",
  }],
};

function detailWithStatus(status: AppointmentStatus): AppointmentDetail {
  return { ...confirmedDetail, status };
}

function cancelledDetail(startingStatus: "Requested" | "Confirmed" = "Confirmed"): AppointmentDetail {
  const beforeCancellation = startingStatus === "Requested"
    ? confirmedDetail.statusHistory.slice(0, 1)
    : confirmedDetail.statusHistory;
  return {
    ...confirmedDetail,
    status: "Cancelled",
    statusHistory: [
      ...beforeCancellation,
      {
        sequence: beforeCancellation.length + 1,
        previousStatus: startingStatus,
        newStatus: "Cancelled",
        actorType: "patientAuthority",
        action: "cancellation",
        occurredAt: "2026-09-02T18:00:00Z",
      },
    ],
  };
}

function summaryFor(detail: AppointmentDetail): AppointmentSummary {
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
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function openCancellation() {
  const trigger = await screen.findByRole("button", { name: "Cancel appointment" });
  fireEvent.click(trigger);
  return screen.findByRole("dialog", { name: "Cancel appointment?" });
}

beforeEach(() => {
  provider.patients = [patient];
  vi.spyOn(beeexyPhase8Api, "getAppointment").mockResolvedValue(confirmedDetail);
  vi.spyOn(beeexyPhase8Api, "cancelAppointment").mockResolvedValue(summaryFor(cancelledDetail()));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Phase 8.5 appointment cancellation", () => {
  it.each([
    ["Requested", true],
    ["Confirmed", true],
    ["Cancelled", false],
    ["Rejected", false],
    ["Completed", false],
    ["NoShow", false],
  ] as const)("centralizes %s cancellation eligibility", async (status, eligible) => {
    expect(canPatientCancelAppointment(status)).toBe(eligible);
    vi.mocked(beeexyPhase8Api.getAppointment).mockResolvedValueOnce(detailWithStatus(status));
    render(<AppointmentDetailView appointmentId={`${confirmedDetail.appointmentId}-${status}`} />);
    await screen.findByText("Booked doctor profile");
    if (eligible) expect(screen.getByRole("button", { name: "Cancel appointment" })).toBeInTheDocument();
    else expect(screen.queryByRole("button", { name: "Cancel appointment" })).not.toBeInTheDocument();
  });

  it("requires an accessible confirmation, shows safe identity, supports Escape, and restores focus", async () => {
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const trigger = await screen.findByRole("button", { name: "Cancel appointment" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Cancel appointment?" });
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(within(dialog).getByText("Thursday, September 10, 2026")).toBeInTheDocument();
    expect(within(dialog).getByText("9:00 AM – 9:30 AM")).toBeInTheDocument();
    expect(within(dialog).getByText("America/Lima")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep appointment" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("button", { name: "Keep appointment" }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(beeexyPhase8Api.cancelAppointment).not.toHaveBeenCalled();
  });

  it("keeps the appointment without a mutation when the secondary action is chosen", async () => {
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    await openCancellation();
    fireEvent.click(screen.getByRole("button", { name: "Keep appointment" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(beeexyPhase8Api.cancelAppointment).not.toHaveBeenCalled();
  });

  it("posts the exact appointment ID with AbortSignal and prevents duplicate submissions", async () => {
    const pending = deferred<AppointmentSummary>();
    vi.mocked(beeexyPhase8Api.cancelAppointment).mockReturnValue(pending.promise);
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    await openCancellation();

    const confirm = screen.getAllByRole("button", { name: "Cancel appointment" }).at(-1)!;
    fireEvent.click(confirm);
    expect(screen.getByRole("button", { name: "Cancelling…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelling…" })).toHaveAttribute("aria-busy", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cancelling…" }));
    expect(beeexyPhase8Api.cancelAppointment).toHaveBeenCalledTimes(1);
    expect(beeexyPhase8Api.cancelAppointment).toHaveBeenCalledWith(
      confirmedDetail.appointmentId,
      expect.any(AbortSignal),
    );

    vi.mocked(beeexyPhase8Api.getAppointment).mockResolvedValueOnce(cancelledDetail());
    pending.resolve(summaryFor(cancelledDetail()));
    expect(await screen.findByText(/latest status history has been refreshed/i)).toBeInTheDocument();
  });

  it.each(["Requested", "Confirmed"] as const)("cancels from %s and renders the authoritative history", async (startingStatus) => {
    const initial = detailWithStatus(startingStatus);
    if (startingStatus === "Requested") initial.statusHistory = confirmedDetail.statusHistory.slice(0, 1);
    const cancelled = cancelledDetail(startingStatus);
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(cancelled);
    vi.mocked(beeexyPhase8Api.cancelAppointment).mockResolvedValueOnce(summaryFor(cancelled));
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    await openCancellation();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel appointment" }).at(-1)!);

    const timeline = await screen.findByRole("list", { name: "Appointment status history" });
    await waitFor(() => expect(within(timeline).getByText("Appointment cancelled")).toBeInTheDocument());
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(startingStatus === "Requested" ? 2 : 3);
    expect(screen.queryByRole("button", { name: "Cancel appointment" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Appointment schedule changes" })).toBeInTheDocument();
    expect(screen.getByText("Schedule changed")).toBeInTheDocument();
    expect(screen.getByText("Booked doctor profile")).toBeInTheDocument();
    expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledTimes(2);
  });

  it("treats a lost response that refetches as Cancelled as a safe same-action outcome", async () => {
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(confirmedDetail)
      .mockResolvedValueOnce(cancelledDetail());
    vi.mocked(beeexyPhase8Api.cancelAppointment).mockRejectedValueOnce(new BeeexyNetworkError());
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    await openCancellation();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel appointment" }).at(-1)!);

    expect(await screen.findByText(/confirmed its current status after reconnecting/i)).toBeInTheDocument();
    expect(screen.getByText("Appointment cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel appointment" })).not.toBeInTheDocument();
  });

  it("handles the exact transition conflict by refetching without claiming success", async () => {
    const rejected = detailWithStatus("Rejected");
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(confirmedDetail)
      .mockResolvedValueOnce(rejected);
    vi.mocked(beeexyPhase8Api.cancelAppointment).mockRejectedValueOnce(new BeeexyApiError(409, {
      problem: { errorCode: "scheduling.appointment_transition_conflict" },
    }));
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    await openCancellation();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel appointment" }).at(-1)!);

    expect(await screen.findByText(/changed while you were viewing it/i)).toBeInTheDocument();
    expect(screen.getAllByText("Declined").length).toBeGreaterThan(0);
    expect(screen.queryByText(/appointment cancelled\. Its latest/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel appointment" })).not.toBeInTheDocument();
    expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledTimes(2);
  });

  it("uses concealed not-found behavior and removes controls after a cancellation 404", async () => {
    vi.mocked(beeexyPhase8Api.cancelAppointment).mockRejectedValueOnce(new BeeexyApiError(404, {
      problem: { errorCode: "scheduling.appointment_target_not_found", detail: "private authority detail" },
    }));
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    await openCancellation();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel appointment" }).at(-1)!);

    expect(await screen.findByRole("heading", { name: "Appointment not found" })).toBeInTheDocument();
    expect(screen.queryByText("private authority detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel appointment" })).not.toBeInTheDocument();
  });

  it("uses the existing safe session-expiry language for 401", async () => {
    vi.mocked(beeexyPhase8Api.cancelAppointment).mockRejectedValueOnce(new BeeexyApiError(401, {
      problem: { detail: "sensitive authentication diagnostics" },
    }));
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    await openCancellation();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel appointment" }).at(-1)!);

    expect(await screen.findByRole("alert")).toHaveTextContent("Your session has ended. Sign in again to continue.");
    expect(screen.queryByText("sensitive authentication diagnostics")).not.toBeInTheDocument();
  });

  it.each([
    ["network", new BeeexyNetworkError()],
    ["server", new BeeexyApiError(500, { problem: { detail: "internal scheduler trace" } })],
  ])("keeps the appointment unchanged and retryable after a %s failure", async (_label, error) => {
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(confirmedDetail)
      .mockResolvedValueOnce(confirmedDetail);
    vi.mocked(beeexyPhase8Api.cancelAppointment).mockRejectedValueOnce(error);
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    await openCancellation();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel appointment" }).at(-1)!);

    expect(await screen.findByRole("alert")).toHaveTextContent("review its status and try again");
    expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Cancel appointment" }).at(-1)).toBeEnabled();
    expect(screen.queryByText("internal scheduler trace")).not.toBeInTheDocument();
    expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledTimes(2);
  });

  it("aborts and ignores a stale cancellation when the route appointment changes", async () => {
    const pending = deferred<AppointmentSummary>();
    vi.mocked(beeexyPhase8Api.cancelAppointment).mockReturnValueOnce(pending.promise);
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(confirmedDetail)
      .mockResolvedValueOnce({ ...confirmedDetail, appointmentId: "appointment-b", reason: "Appointment B" });
    const view = render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    await openCancellation();
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel appointment" }).at(-1)!);

    const signal = vi.mocked(beeexyPhase8Api.cancelAppointment).mock.calls[0][1]!;
    view.rerender(<AppointmentDetailView appointmentId="appointment-b" />);
    expect(await screen.findByText("Appointment B")).toBeInTheDocument();
    expect(signal.aborted).toBe(true);
    pending.resolve(summaryFor(cancelledDetail()));
    await Promise.resolve();
    expect(screen.queryByText(/latest status history has been refreshed/i)).not.toBeInTheDocument();
    expect(screen.getByText("Appointment B")).toBeInTheDocument();
  });
});
