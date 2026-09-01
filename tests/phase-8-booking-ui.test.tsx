// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoctorAvailability } from "@/features/appointments/doctor-availability";
import type {
  AccessiblePatient,
  AvailabilitySlot,
  DoctorDetail,
  RequestAppointmentResponse,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const provider = vi.hoisted(() => ({
  activePatient: null as AccessiblePatient | null,
  authStatus: "authenticated",
  patientStatus: "ready",
  patients: [] as AccessiblePatient[],
  refreshPatients: vi.fn<() => Promise<AccessiblePatient[]>>(),
  selectActivePatient: vi.fn<(profileId: string) => boolean>(),
}));

vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: provider.authStatus }),
}));

vi.mock("@/features/my-circle/patient-provider", () => ({
  usePatients: () => ({
    activePatient: provider.activePatient,
    bootstrapStatus: provider.patientStatus,
    patients: provider.patients,
    refreshPatients: provider.refreshPatients,
    selectActivePatient: provider.selectActivePatient,
  }),
}));

const primaryPatient: AccessiblePatient = {
  profileId: "31000000-0000-4000-8000-000000000001",
  beeexyId: "BXY-PRIMARY",
  firstName: "Avery",
  lastName: "Patient",
  accessType: "Primary",
  relationship: null,
};

const managedPatient: AccessiblePatient = {
  profileId: "31000000-0000-4000-8000-000000000002",
  beeexyId: "BXY-MANAGED",
  firstName: "Milo",
  lastName: "Patient",
  accessType: "Managed",
  relationship: {
    relationshipId: "relationship-1",
    type: "Child",
  },
};

const doctor: DoctorDetail = {
  doctorId: "71030000-0000-4000-8000-000000000001",
  code: "demo-doctor-amber",
  displayName: "Synthetic Demo Doctor Amber",
  specialties: [{ code: "demo-specialty-general", name: "Synthetic General Care" }],
  languages: [{ code: "demo-language-en", name: "Synthetic English Capability" }],
  affiliations: [{
    clinicId: "71020000-0000-4000-8000-000000000001",
    clinicCode: "demo-clinic-aurora",
    clinicName: "Synthetic Demo Clinic Aurora",
    location: {
      locationId: "71021000-0000-4000-8000-000000000001",
      name: "Synthetic Aurora Central Location",
      locality: "Demo Central",
      administrativeArea: "Synthetic Demo Region",
      country: "Synthetic Demo Country",
      timeZone: "America/Lima",
    },
  }],
  storedInsuranceParticipations: [],
  credentials: [],
};

const firstSlot: AvailabilitySlot = {
  slotId: "82000000-0000-4000-8000-000000000001",
  doctorId: doctor.doctorId,
  clinicId: doctor.affiliations[0].clinicId,
  locationId: doctor.affiliations[0].location!.locationId,
  startsAt: "2026-09-10T14:00:00+00:00",
  endsAt: "2026-09-10T14:30:00+00:00",
  clinicTimeZone: "America/Lima",
  modality: "inPerson",
};

const secondSlot: AvailabilitySlot = {
  ...firstSlot,
  slotId: "82000000-0000-4000-8000-000000000002",
  startsAt: "2026-09-10T15:30:00+00:00",
  endsAt: "2026-09-10T16:00:00+00:00",
  modality: "virtual",
};

const thirdSlot: AvailabilitySlot = {
  ...firstSlot,
  slotId: "82000000-0000-4000-8000-000000000003",
  startsAt: "2026-09-11T14:00:00+00:00",
  endsAt: "2026-09-11T14:30:00+00:00",
};

function appointmentFor(slot: AvailabilitySlot): RequestAppointmentResponse {
  return {
    appointmentId: "94000000-0000-4000-8000-000000000001",
    patientId: primaryPatient.profileId,
    slotId: slot.slotId,
    doctorId: slot.doctorId,
    clinicId: slot.clinicId,
    locationId: slot.locationId,
    status: "Requested",
    modality: slot.modality,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    clinicTimeZone: slot.clinicTimeZone,
    createdAt: "2026-09-01T18:00:00+00:00",
  };
}

function slotButton(time: RegExp) {
  return screen.getByRole("button", { name: time });
}

function requestButton() {
  return screen.getByRole("button", { name: /request appointment/i });
}

function reviewValue(label: string) {
  const term = screen.getByText(label, { selector: "dt" });
  return term.parentElement?.querySelector("dd");
}

function renderAvailability() {
  return render(<DoctorAvailability doctor={doctor} />);
}

beforeEach(() => {
  provider.activePatient = primaryPatient;
  provider.authStatus = "authenticated";
  provider.patientStatus = "ready";
  provider.patients = [primaryPatient, managedPatient];
  provider.refreshPatients.mockReset().mockResolvedValue(provider.patients);
  provider.selectActivePatient.mockReset().mockReturnValue(true);
  vi.spyOn(beeexyPhase8Api, "listDoctorSlots").mockResolvedValue([firstSlot, secondSlot, thirdSlot]);
  vi.spyOn(beeexyPhase8Api, "createAppointment").mockResolvedValue(appointmentFor(firstSlot));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Phase 8.2 doctor availability", () => {
  it("loads anonymous availability and renders backend order, modality, clinic time, and date browsing", async () => {
    renderAvailability();

    expect(screen.getByRole("status", { name: /loading appointment availability/i })).toBeInTheDocument();
    const first = await screen.findByRole("button", { name: /9:00 AM to 9:30 AM, In person/i });
    const group = screen.getByRole("group", { name: "Thursday, September 10" });
    expect(within(group).getAllByRole("button")).toEqual([first, slotButton(/10:30 AM to 11:00 AM, Virtual/i)]);
    expect(first).toHaveAccessibleName(/Synthetic Demo Clinic Aurora.*Synthetic Aurora Central Location.*America\/Lima/i);
    expect(screen.getAllByText("Clinic time · America/Lima")).toHaveLength(2);
    expect(beeexyPhase8Api.listDoctorSlots).toHaveBeenCalledWith(doctor.doctorId, {}, expect.any(AbortSignal));

    fireEvent.click(screen.getByRole("button", { name: /Fri11Sep/i }));
    expect(screen.getByRole("group", { name: "Friday, September 11" })).toBeInTheDocument();
  });

  it("renders a no-availability state without hiding the doctor context", async () => {
    vi.mocked(beeexyPhase8Api.listDoctorSlots).mockResolvedValue([]);
    renderAvailability();
    expect(await screen.findByText("No appointment times available")).toBeInTheDocument();
    expect(screen.getByText(/currently available in this date range/i)).toBeInTheDocument();
  });

  it("renders a safe availability error and retries without exposing backend detail", async () => {
    vi.mocked(beeexyPhase8Api.listDoctorSlots)
      .mockRejectedValueOnce(new BeeexyApiError(500, { problem: { detail: "database unavailable" } }))
      .mockResolvedValueOnce([firstSlot]);
    renderAvailability();

    expect(await screen.findByText("We couldn’t load availability.")).toBeInTheDocument();
    expect(screen.queryByText("database unavailable")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i })).toBeInTheDocument();
  });

  it("exposes selected state and updates the review when the slot changes", async () => {
    renderAvailability();
    const first = await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i });
    const second = slotButton(/10:30 AM to 11:00 AM/i);

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(reviewValue("Date and time")).toHaveTextContent("9:00 AM to 9:30 AM");

    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(reviewValue("Date and time")).toHaveTextContent("10:30 AM to 11:00 AM");
    expect(reviewValue("Modality")).toHaveTextContent("Virtual");
  });

  it("uses the active PatientProfile by default and sends the exact selected patient, slot, modality, reason, and key", async () => {
    const key = "93000000-0000-4000-8000-000000000001";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(key);
    vi.mocked(beeexyPhase8Api.createAppointment).mockResolvedValue({
      ...appointmentFor(secondSlot),
      patientId: managedPatient.profileId,
      reason: "Follow-up visit",
    });
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /10:30 AM to 11:00 AM/i }));
    const patientSelect = screen.getByRole("combobox", { name: "Patient profile" });
    expect(patientSelect).toHaveValue(primaryPatient.profileId);
    fireEvent.change(patientSelect, { target: { value: managedPatient.profileId } });
    fireEvent.change(screen.getByRole("textbox", { name: /reason for visit/i }), { target: { value: "  Follow-up visit  " } });
    fireEvent.click(requestButton());

    await waitFor(() => expect(beeexyPhase8Api.createAppointment).toHaveBeenCalledWith({
      patientId: managedPatient.profileId,
      slotId: secondSlot.slotId,
      modality: "virtual",
      reason: "Follow-up visit",
      idempotencyKey: key,
    }, expect.any(AbortSignal)));
    expect(provider.selectActivePatient).toHaveBeenCalledWith(managedPatient.profileId);
  });

  it("reuses one idempotency key when retrying an unchanged request after an uncertain network failure", async () => {
    const key = "93000000-0000-4000-8000-000000000001";
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(key);
    vi.mocked(beeexyPhase8Api.createAppointment)
      .mockRejectedValueOnce(new BeeexyNetworkError())
      .mockResolvedValueOnce(appointmentFor(firstSlot));
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    fireEvent.click(requestButton());
    expect(await screen.findByText(/couldn’t confirm whether your request was received/i)).toBeInTheDocument();
    fireEvent.click(requestButton());

    await screen.findByText("Appointment request submitted");
    expect(vi.mocked(beeexyPhase8Api.createAppointment).mock.calls.map(([request]) => request.idempotencyKey)).toEqual([key, key]);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("creates a new logical idempotency attempt after the selected slot changes", async () => {
    const firstKey = "93000000-0000-4000-8000-000000000001";
    const secondKey = "93000000-0000-4000-8000-000000000002";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(firstKey).mockReturnValueOnce(secondKey);
    vi.mocked(beeexyPhase8Api.createAppointment).mockRejectedValue(new BeeexyNetworkError());
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    fireEvent.click(requestButton());
    await screen.findByText(/couldn’t confirm whether your request was received/i);
    fireEvent.click(slotButton(/10:30 AM to 11:00 AM/i));
    fireEvent.click(requestButton());

    await waitFor(() => expect(beeexyPhase8Api.createAppointment).toHaveBeenCalledTimes(2));
    expect(vi.mocked(beeexyPhase8Api.createAppointment).mock.calls.map(([request]) => request.idempotencyKey)).toEqual([firstKey, secondKey]);
  });

  it("disables duplicate submission while the appointment request is pending", async () => {
    let resolve!: (appointment: RequestAppointmentResponse) => void;
    const pending = new Promise<RequestAppointmentResponse>((done) => { resolve = done; });
    vi.mocked(beeexyPhase8Api.createAppointment).mockReturnValue(pending);
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    const submit = requestButton();
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    fireEvent.click(submit);
    expect(beeexyPhase8Api.createAppointment).toHaveBeenCalledTimes(1);
    resolve(appointmentFor(firstSlot));
    expect(await screen.findByText("Appointment request submitted")).toBeInTheDocument();
  });

  it("shows Requested success and refetches availability so the reserved slot disappears", async () => {
    vi.mocked(beeexyPhase8Api.listDoctorSlots)
      .mockResolvedValueOnce([firstSlot, secondSlot])
      .mockResolvedValueOnce([secondSlot]);
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    fireEvent.click(requestButton());

    expect(await screen.findByText("Appointment request submitted")).toBeInTheDocument();
    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.getByText(/clinic will review your request/i)).toBeInTheDocument();
    await waitFor(() => expect(beeexyPhase8Api.listDoctorSlots).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "View more times" }));
    expect(screen.queryByRole("button", { name: /9:00 AM to 9:30 AM/i })).not.toBeInTheDocument();
    expect(slotButton(/10:30 AM to 11:00 AM/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view appointments/i })).not.toBeInTheDocument();
  });

  it("refreshes and clears an occupied slot after a reservation conflict", async () => {
    vi.mocked(beeexyPhase8Api.listDoctorSlots)
      .mockResolvedValueOnce([firstSlot, secondSlot])
      .mockResolvedValueOnce([secondSlot]);
    vi.mocked(beeexyPhase8Api.createAppointment).mockRejectedValue(new BeeexyApiError(409, {
      problem: { errorCode: "scheduling.slot_reserved" },
    }));
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    fireEvent.click(requestButton());

    expect(await screen.findByText("That time is no longer available. Please choose another slot.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /9:00 AM to 9:30 AM/i })).not.toBeInTheDocument();
    expect(slotButton(/10:30 AM to 11:00 AM/i)).toHaveAttribute("aria-pressed", "false");
    expect(beeexyPhase8Api.listDoctorSlots).toHaveBeenCalledTimes(2);
  });

  it("regenerates attempt state after an incompatible idempotency conflict", async () => {
    const firstKey = "93000000-0000-4000-8000-000000000001";
    const secondKey = "93000000-0000-4000-8000-000000000002";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValueOnce(firstKey).mockReturnValueOnce(secondKey);
    vi.mocked(beeexyPhase8Api.createAppointment)
      .mockRejectedValueOnce(new BeeexyApiError(409, { problem: { errorCode: "scheduling.idempotency_key_reused" } }))
      .mockResolvedValueOnce(appointmentFor(firstSlot));
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    fireEvent.click(requestButton());
    expect(await screen.findByText(/couldn’t safely complete that request/i)).toBeInTheDocument();
    fireEvent.click(requestButton());

    await screen.findByText("Appointment request submitted");
    expect(vi.mocked(beeexyPhase8Api.createAppointment).mock.calls.map(([request]) => request.idempotencyKey)).toEqual([firstKey, secondKey]);
  });

  it("refreshes and clears an expired slot after semantic validation", async () => {
    vi.mocked(beeexyPhase8Api.listDoctorSlots)
      .mockResolvedValueOnce([firstSlot, secondSlot])
      .mockResolvedValueOnce([secondSlot]);
    vi.mocked(beeexyPhase8Api.createAppointment).mockRejectedValue(new BeeexyApiError(422, {
      problem: { errorCode: "scheduling.slot_expired" },
    }));
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    fireEvent.click(requestButton());

    expect(await screen.findByText(/appointment time is no longer available/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /9:00 AM to 9:30 AM/i })).not.toBeInTheDocument();
    expect(beeexyPhase8Api.listDoctorSlots).toHaveBeenCalledTimes(2);
  });

  it("uses the existing sign-in route for anonymous booking intent", async () => {
    provider.authStatus = "unauthenticated";
    provider.activePatient = null;
    provider.patients = [];
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(beeexyPhase8Api.createAppointment).not.toHaveBeenCalled();
  });

  it("routes an expired authenticated session back through the existing sign-in flow", async () => {
    vi.mocked(beeexyPhase8Api.createAppointment).mockRejectedValue(new BeeexyApiError(401));
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    fireEvent.click(requestButton());

    expect(await screen.findByText(/session has ended/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("revalidates profiles and availability after concealed authorization loss", async () => {
    vi.mocked(beeexyPhase8Api.createAppointment).mockRejectedValue(new BeeexyApiError(404, {
      problem: { errorCode: "scheduling.appointment_target_not_found", detail: "hidden profile" },
    }));
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    fireEvent.click(requestButton());

    expect(await screen.findByText(/patient profile or appointment time is no longer available/i)).toBeInTheDocument();
    expect(screen.queryByText("hidden profile")).not.toBeInTheDocument();
    expect(provider.refreshPatients).toHaveBeenCalledTimes(1);
    expect(beeexyPhase8Api.listDoctorSlots).toHaveBeenCalledTimes(2);
  });

  it("associates backend reason validation with the labeled input", async () => {
    vi.mocked(beeexyPhase8Api.createAppointment).mockRejectedValue(new BeeexyApiError(422, {
      problem: { errorCode: "scheduling.reason_invalid" },
    }));
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    const reason = screen.getByRole("textbox", { name: /reason for visit/i });
    fireEvent.change(reason, { target: { value: "Follow-up" } });
    fireEvent.click(requestButton());

    const error = await screen.findByText(/non-blank reason using 500 characters/i);
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason.getAttribute("aria-describedby")).toContain(error.id);
  });

  it("uses generic safe copy for an unexpected booking failure", async () => {
    vi.mocked(beeexyPhase8Api.createAppointment).mockRejectedValue(new BeeexyApiError(400, {
      problem: { detail: "internal binding diagnostics" },
    }));
    renderAvailability();

    fireEvent.click(await screen.findByRole("button", { name: /9:00 AM to 9:30 AM/i }));
    fireEvent.click(requestButton());

    expect(await screen.findByText("We couldn’t request this appointment. Check your selections and try again.")).toBeInTheDocument();
    expect(screen.queryByText("internal binding diagnostics")).not.toBeInTheDocument();
  });
});
