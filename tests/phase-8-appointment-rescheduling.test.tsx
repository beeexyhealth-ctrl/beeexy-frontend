// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canPatientRescheduleAppointment } from "@/features/appointments/appointment-detail-state";
import { AppointmentDetailView } from "@/features/appointments/appointment-detail-view";
import {
  APPOINTMENT_LIST_REFRESH_EVENT,
  DOCTOR_AVAILABILITY_REFRESH_EVENT,
} from "@/features/appointments/appointment-refresh";
import type {
  AccessiblePatient,
  AppointmentDetail,
  AppointmentStatus,
  AppointmentSummary,
  AvailabilitySlot,
  DoctorDetail,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase7Api } from "@/lib/beeexy-api/phase-7-api";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const provider = vi.hoisted(() => ({ patients: [] as AccessiblePatient[] }));

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

const currentDoctor: DoctorDetail = {
  doctorId: "71030000-0000-4000-8000-000000000001",
  code: "doctor-current",
  displayName: "Dr. Current",
  specialties: [],
  languages: [],
  affiliations: [{
    clinicId: "71020000-0000-4000-8000-000000000001",
    clinicCode: "clinic-current",
    clinicName: "Current Care Clinic",
    location: {
      locationId: "71021000-0000-4000-8000-000000000001",
      name: "Lima Central",
      locality: "Lima",
      administrativeArea: "Lima",
      country: "PE",
      timeZone: "America/Lima",
    },
  }],
  storedInsuranceParticipations: [],
  credentials: [],
};

const otherDoctor: DoctorDetail = {
  ...currentDoctor,
  doctorId: "71030000-0000-4000-8000-000000000002",
  code: "doctor-other",
  displayName: "Dr. Pacific",
  affiliations: [{
    clinicId: "71020000-0000-4000-8000-000000000002",
    clinicCode: "clinic-pacific",
    clinicName: "Pacific Care Clinic",
    location: {
      locationId: "71021000-0000-4000-8000-000000000002",
      name: "Pacific North",
      locality: "Los Angeles",
      administrativeArea: "CA",
      country: "US",
      timeZone: "America/Los_Angeles",
    },
  }],
};

const confirmedDetail: AppointmentDetail = {
  appointmentId: "94000000-0000-4000-8000-000000000001",
  patientId: patient.profileId,
  slotId: "82000000-0000-4000-8000-000000000001",
  doctorId: currentDoctor.doctorId,
  clinicId: currentDoctor.affiliations[0].clinicId,
  locationId: currentDoctor.affiliations[0].location!.locationId,
  status: "Confirmed",
  modality: "inPerson",
  startsAt: "2026-09-10T14:00:00Z",
  endsAt: "2026-09-10T14:30:00Z",
  clinicTimeZone: "America/Lima",
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
  rescheduleHistory: [],
};

const currentSlot: AvailabilitySlot = {
  slotId: confirmedDetail.slotId,
  doctorId: currentDoctor.doctorId,
  clinicId: currentDoctor.affiliations[0].clinicId,
  locationId: currentDoctor.affiliations[0].location!.locationId,
  startsAt: confirmedDetail.startsAt,
  endsAt: confirmedDetail.endsAt,
  clinicTimeZone: confirmedDetail.clinicTimeZone,
  modality: "inPerson",
};

const targetSlot: AvailabilitySlot = {
  ...currentSlot,
  slotId: "82000000-0000-4000-8000-000000000009",
  startsAt: "2026-09-11T16:00:00Z",
  endsAt: "2026-09-11T16:30:00Z",
};

const incompatibleSlot: AvailabilitySlot = {
  ...targetSlot,
  slotId: "82000000-0000-4000-8000-000000000008",
  startsAt: "2026-09-11T17:00:00Z",
  endsAt: "2026-09-11T17:30:00Z",
  modality: "virtual",
};

const crossDoctorSlot: AvailabilitySlot = {
  slotId: "82000000-0000-4000-8000-000000000010",
  doctorId: otherDoctor.doctorId,
  clinicId: otherDoctor.affiliations[0].clinicId,
  locationId: otherDoctor.affiliations[0].location!.locationId,
  startsAt: "2026-09-12T17:00:00Z",
  endsAt: "2026-09-12T17:30:00Z",
  clinicTimeZone: "America/Los_Angeles",
  modality: "inPerson",
};

function detailWithStatus(status: AppointmentStatus): AppointmentDetail {
  return { ...confirmedDetail, status };
}

function summaryFor(detail: AppointmentDetail, slot: AvailabilitySlot): AppointmentSummary {
  return {
    appointmentId: detail.appointmentId,
    patientId: detail.patientId,
    slotId: slot.slotId,
    doctorId: slot.doctorId,
    clinicId: slot.clinicId,
    locationId: slot.locationId,
    status: detail.status,
    modality: detail.modality,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    clinicTimeZone: slot.clinicTimeZone,
    createdAt: detail.createdAt,
  };
}

function rescheduledDetail(startingStatus: "Requested" | "Confirmed", slot = targetSlot): AppointmentDetail {
  const initial = startingStatus === "Requested"
    ? { ...confirmedDetail, status: startingStatus, statusHistory: confirmedDetail.statusHistory.slice(0, 1) }
    : confirmedDetail;
  return {
    ...initial,
    ...summaryFor(initial, slot),
    rescheduleHistory: [{
      previousSlotId: initial.slotId,
      newSlotId: slot.slotId,
      occurredAt: "2026-09-02T20:00:00Z",
    }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function openReschedule() {
  fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
  const dialog = await screen.findByRole("dialog", { name: "Reschedule appointment" });
  fireEvent.click(await within(dialog).findByRole("button", { name: /Fri11Sep/i }));
  await within(dialog).findByRole("button", { name: /11:00 AM to 11:30 AM/i });
  return dialog;
}

beforeEach(() => {
  provider.patients = [patient];
  vi.spyOn(beeexyPhase8Api, "getAppointment").mockResolvedValue(confirmedDetail);
  vi.spyOn(beeexyPhase8Api, "listDoctorSlots").mockResolvedValue([currentSlot, targetSlot, incompatibleSlot]);
  vi.spyOn(beeexyPhase8Api, "rescheduleAppointment").mockResolvedValue(summaryFor(confirmedDetail, targetSlot));
  vi.spyOn(beeexyPhase7Api, "getDoctor").mockResolvedValue(currentDoctor);
  vi.spyOn(beeexyPhase7Api, "searchDoctors").mockResolvedValue({ items: [currentDoctor, otherDoctor], nextCursor: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Phase 8.6 transactional appointment rescheduling", () => {
  it.each([
    ["Requested", true],
    ["Confirmed", true],
    ["Cancelled", false],
    ["Rejected", false],
    ["Completed", false],
    ["NoShow", false],
  ] as const)("centralizes %s reschedule eligibility", async (status, eligible) => {
    expect(canPatientRescheduleAppointment(status)).toBe(eligible);
    vi.mocked(beeexyPhase8Api.getAppointment).mockResolvedValueOnce(detailWithStatus(status));
    render(<AppointmentDetailView appointmentId={`${confirmedDetail.appointmentId}-${status}`} />);
    await screen.findByText("Booked doctor profile");
    if (eligible) expect(screen.getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
    else expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
  });

  it("opens an accessible flow, preserves current context, and loads backend doctor slots", async () => {
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const trigger = await screen.findByRole("button", { name: "Reschedule" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Reschedule appointment" });
    expect(dialog).toHaveAttribute("aria-describedby");
    const current = within(dialog).getByRole("region", { name: "Current appointment" });
    expect(current).toHaveTextContent("Thursday, September 10, 2026");
    expect(current).toHaveTextContent("Current Care Clinic · Lima Central");
    expect(within(dialog).getByText("Confirmed")).toBeInTheDocument();
    expect(within(dialog).getByText(/original appointment remains unchanged/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep current appointment and close/i })).toHaveFocus();

    fireEvent.click(await within(dialog).findByRole("button", { name: /Fri11Sep/i }));
    await within(dialog).findByRole("button", { name: /11:00 AM to 11:30 AM/i });
    expect(beeexyPhase8Api.listDoctorSlots).toHaveBeenCalledWith(currentDoctor.doctorId, {}, expect.any(AbortSignal));
    expect(beeexyPhase7Api.searchDoctors).toHaveBeenCalledWith({ pageSize: 20 }, expect.any(AbortSignal));
    expect(screen.getAllByText("Thursday, September 10, 2026").length).toBeGreaterThan(0);
  });

  it("reuses accessible date/slot controls and prevents current or incompatible selection", async () => {
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();

    const incompatible = within(dialog).getByRole("button", { name: /not compatible with current visit type/i });
    expect(incompatible).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /Thu10Sep/i }));
    const current = within(dialog).getByRole("button", { name: /current appointment time/i });
    expect(current).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /Fri11Sep/i }));
    const target = within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i });
    expect(target).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(target);
    expect(target).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("heading", { name: "Current and new schedule" })).toBeInTheDocument();
  });

  it("shows an authoritative current-vs-new review with clinic, modality, and timezone", async () => {
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));

    const current = within(dialog).getByRole("article", { name: "Thursday, September 10, 2026" });
    const next = within(dialog).getByRole("article", { name: "Friday, September 11, 2026" });
    expect(current).toHaveTextContent("9:00 AM – 9:30 AM");
    expect(current).toHaveTextContent("Current Care Clinic · Lima Central");
    expect(current).toHaveTextContent("In person · America/Lima");
    expect(next).toHaveTextContent("11:00 AM – 11:30 AM");
    expect(next).toHaveTextContent("Current Care Clinic");
    expect(next).toHaveTextContent("In person · America/Lima");
    expect(within(dialog).getByText(/current appointment stays reserved unless this change succeeds/i)).toBeInTheDocument();
  });

  it("supports a backend-listed cross-doctor target and uses its own clinic timezone", async () => {
    vi.mocked(beeexyPhase8Api.listDoctorSlots)
      .mockResolvedValueOnce([targetSlot])
      .mockResolvedValueOnce([crossDoctorSlot]);
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    const dialog = await screen.findByRole("dialog", { name: "Reschedule appointment" });
    const doctorSelect = await within(dialog).findByRole("combobox", { name: "Doctor for the new time" });
    fireEvent.change(doctorSelect, { target: { value: otherDoctor.doctorId } });

    const target = await within(dialog).findByRole("button", { name: /10:00 AM to 10:30 AM.*Pacific Care Clinic.*America\/Los_Angeles/i });
    fireEvent.click(target);
    expect(within(dialog).getByText("In person · America/Los_Angeles")).toBeInTheDocument();
    expect(beeexyPhase8Api.listDoctorSlots).toHaveBeenLastCalledWith(otherDoctor.doctorId, {}, expect.any(AbortSignal));
  });

  it("submits only the target slot for the same appointment and blocks duplicate/cancel mutations", async () => {
    const pending = deferred<AppointmentSummary>();
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockReturnValueOnce(pending.promise);
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));

    const submitting = within(dialog).getByRole("button", { name: "Rescheduling…" });
    expect(submitting).toBeDisabled();
    expect(submitting).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancel appointment" })).toBeDisabled();
    fireEvent.click(submitting);
    expect(beeexyPhase8Api.rescheduleAppointment).toHaveBeenCalledTimes(1);
    expect(beeexyPhase8Api.rescheduleAppointment).toHaveBeenCalledWith(
      confirmedDetail.appointmentId,
      { slotId: targetSlot.slotId },
      expect.any(AbortSignal),
    );

    vi.mocked(beeexyPhase8Api.getAppointment).mockResolvedValueOnce(rescheduledDetail("Confirmed"));
    pending.resolve(summaryFor(confirmedDetail, targetSlot));
    expect(await screen.findByText(/updated schedule and history are ready/i)).toBeInTheDocument();
  });

  it.each(["Requested", "Confirmed"] as const)("preserves %s status, ID, and real backend histories after success", async (status) => {
    const initial = detailWithStatus(status);
    if (status === "Requested") initial.statusHistory = confirmedDetail.statusHistory.slice(0, 1);
    const updated = rescheduledDetail(status);
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated);
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockResolvedValueOnce(summaryFor(initial, targetSlot));
    render(<AppointmentDetailView appointmentId={initial.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));

    expect(await screen.findByText(/updated schedule and history are ready/i)).toBeInTheDocument();
    expect(screen.getAllByText(status === "Requested" ? "Pending confirmation" : "Confirmed").length).toBeGreaterThan(0);
    const timeline = screen.getByRole("list", { name: "Appointment status history" });
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(status === "Requested" ? 1 : 2);
    expect(within(timeline).queryByText(/rescheduled/i)).not.toBeInTheDocument();
    const scheduleHistory = screen.getByRole("list", { name: "Appointment schedule changes" });
    expect(within(scheduleHistory).getByText("Schedule changed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to My Appointments" })).toHaveAttribute("href", "/appointments");
    expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledTimes(2);
  });

  it("invalidates the patient list plus old and cross-doctor availability after success", async () => {
    vi.mocked(beeexyPhase8Api.listDoctorSlots)
      .mockResolvedValueOnce([targetSlot])
      .mockResolvedValueOnce([crossDoctorSlot]);
    const updated = rescheduledDetail("Confirmed", crossDoctorSlot);
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(confirmedDetail)
      .mockResolvedValueOnce(updated);
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockResolvedValueOnce(summaryFor(confirmedDetail, crossDoctorSlot));
    const patientEvents: string[] = [];
    const doctorEvents: string[] = [];
    const onPatient = (event: Event) => patientEvents.push((event as CustomEvent).detail.patientId);
    const onDoctor = (event: Event) => doctorEvents.push((event as CustomEvent).detail.doctorId);
    window.addEventListener(APPOINTMENT_LIST_REFRESH_EVENT, onPatient);
    window.addEventListener(DOCTOR_AVAILABILITY_REFRESH_EVENT, onDoctor);

    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    const dialog = await screen.findByRole("dialog", { name: "Reschedule appointment" });
    fireEvent.change(await within(dialog).findByRole("combobox", { name: "Doctor for the new time" }), {
      target: { value: otherDoctor.doctorId },
    });
    fireEvent.click(await within(dialog).findByRole("button", { name: /10:00 AM to 10:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));
    await screen.findByText(/updated schedule and history are ready/i);

    expect(patientEvents).toEqual([patient.profileId]);
    expect(doctorEvents).toEqual([currentDoctor.doctorId, otherDoctor.doctorId]);
    window.removeEventListener(APPOINTMENT_LIST_REFRESH_EVENT, onPatient);
    window.removeEventListener(DOCTOR_AVAILABILITY_REFRESH_EVENT, onDoctor);
  });

  it("preserves the original schedule and refreshes slots after a target conflict", async () => {
    vi.mocked(beeexyPhase8Api.listDoctorSlots)
      .mockResolvedValueOnce([targetSlot])
      .mockResolvedValueOnce([]);
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockRejectedValueOnce(new BeeexyApiError(409, {
      problem: { errorCode: "scheduling.slot_reserved", detail: "database reservation conflict" },
    }));
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("That time is no longer available. Please choose another slot.");
    expect(within(dialog).getByRole("region", { name: "Current appointment" })).toHaveTextContent("Thursday, September 10, 2026");
    expect(screen.getAllByText("Thursday, September 10, 2026").length).toBeGreaterThan(0);
    expect(screen.queryByText("database reservation conflict")).not.toBeInTheDocument();
    expect(beeexyPhase8Api.listDoctorSlots).toHaveBeenCalledTimes(2);
    expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledTimes(1);
  });

  it("refreshes authoritative detail and closes an ineligible appointment-state conflict", async () => {
    const cancelled = detailWithStatus("Cancelled");
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(confirmedDetail)
      .mockResolvedValueOnce(cancelled);
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockRejectedValueOnce(new BeeexyApiError(409, {
      problem: { errorCode: "scheduling.appointment_reschedule_conflict" },
    }));
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));

    expect(await screen.findByText(/can no longer be rescheduled/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Reschedule appointment" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
    expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledTimes(2);
  });

  it("requires fresh review after an appointment-state conflict that remains eligible", async () => {
    const requested = detailWithStatus("Requested");
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(requested)
      .mockResolvedValueOnce(confirmedDetail);
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockRejectedValueOnce(new BeeexyApiError(409, {
      problem: { errorCode: "scheduling.appointment_reschedule_conflict" },
    }));
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/review the refreshed schedule/i);
    expect(within(dialog).queryByRole("button", { name: "Confirm reschedule" })).not.toBeInTheDocument();
    expect(beeexyPhase8Api.rescheduleAppointment).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["scheduling.slot_expired", /no longer available/i],
    ["scheduling.slot_unbookable", /no longer available/i],
    ["scheduling.modality_mismatch", /not compatible/i],
  ])("clears and refreshes an invalid target after 422 %s", async (errorCode, message) => {
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockRejectedValueOnce(new BeeexyApiError(422, {
      problem: { errorCode: errorCode as "scheduling.slot_expired" },
    }));
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(within(dialog).queryByRole("button", { name: "Confirm reschedule" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Thursday, September 10, 2026").length).toBeGreaterThan(0);
    expect(beeexyPhase8Api.listDoctorSlots).toHaveBeenCalledTimes(2);
  });

  it("preserves concealment and removes mutation controls after 404", async () => {
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockRejectedValueOnce(new BeeexyApiError(404, {
      problem: { errorCode: "scheduling.appointment_target_not_found", detail: "private ownership detail" },
    }));
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));

    expect(await screen.findByRole("heading", { name: "Appointment not found" })).toBeInTheDocument();
    expect(screen.queryByText("private ownership detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
  });

  it("uses safe session behavior for 401 without exposing backend details", async () => {
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockRejectedValueOnce(new BeeexyApiError(401, {
      problem: { detail: "sensitive token trace" },
    }));
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Your session has ended. Sign in again to continue.");
    expect(screen.queryByText("sensitive token trace")).not.toBeInTheDocument();
  });

  it("reconciles a lost response to the authoritative target without a false retry", async () => {
    const updated = rescheduledDetail("Confirmed");
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(confirmedDetail)
      .mockResolvedValueOnce(updated);
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockRejectedValueOnce(new BeeexyNetworkError());
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));

    expect(await screen.findByText(/confirmed the updated schedule after reconnecting/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Reschedule appointment" })).not.toBeInTheDocument();
    expect(beeexyPhase8Api.rescheduleAppointment).toHaveBeenCalledTimes(1);
  });

  it("keeps the original appointment and requires review after a confirmed network failure", async () => {
    vi.mocked(beeexyPhase8Api.getAppointment)
      .mockResolvedValueOnce(confirmedDetail)
      .mockResolvedValueOnce(confirmedDetail);
    vi.mocked(beeexyPhase8Api.rescheduleAppointment).mockRejectedValueOnce(new BeeexyNetworkError());
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const dialog = await openReschedule();
    fireEvent.click(within(dialog).getByRole("button", { name: /11:00 AM to 11:30 AM/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reschedule" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/original appointment is still current/i);
    expect(within(dialog).getByRole("button", { name: "Confirm reschedule" })).toBeEnabled();
    expect(screen.getAllByText("Thursday, September 10, 2026").length).toBeGreaterThan(0);
    expect(beeexyPhase8Api.getAppointment).toHaveBeenCalledTimes(2);
  });

  it("closes with Escape and restores focus without submitting", async () => {
    render(<AppointmentDetailView appointmentId={confirmedDetail.appointmentId} />);
    const trigger = await screen.findByRole("button", { name: "Reschedule" });
    trigger.focus();
    fireEvent.click(trigger);
    const close = await screen.findByRole("button", { name: /keep current appointment and close/i });
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Reschedule appointment" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(beeexyPhase8Api.rescheduleAppointment).not.toHaveBeenCalled();
  });
});
