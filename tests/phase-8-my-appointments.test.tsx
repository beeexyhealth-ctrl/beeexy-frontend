// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicRoute } from "@/features/auth/auth-route-boundary";
import { AppointmentSummaryCard, AppointmentsView } from "@/features/appointments/appointments-view";
import { notifyAppointmentListChanged } from "@/features/appointments/appointment-refresh";
import type { AccessiblePatient, AppointmentStatus, AppointmentSummary } from "@/lib/beeexy-api/contracts";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const provider = vi.hoisted(() => ({
  activePatient: null as AccessiblePatient | null,
  patients: [] as AccessiblePatient[],
  refreshPatients: vi.fn<() => Promise<AccessiblePatient[]>>(),
}));

vi.mock("@/features/my-circle/patient-provider", () => ({
  usePatients: () => ({
    activePatient: provider.activePatient,
    patients: provider.patients,
    refreshPatients: provider.refreshPatients,
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
  relationship: { relationshipId: "relationship-1", type: "Child" },
};

function appointment(
  appointmentId: string,
  options: Partial<AppointmentSummary> = {},
): AppointmentSummary {
  return {
    appointmentId,
    patientId: primaryPatient.profileId,
    slotId: `slot-${appointmentId}`,
    doctorId: "71030000-0000-4000-8000-000000000001",
    clinicId: "71020000-0000-4000-8000-000000000001",
    locationId: "71021000-0000-4000-8000-000000000001",
    status: "Confirmed",
    modality: "inPerson",
    startsAt: "2099-09-10T14:00:00+00:00",
    endsAt: "2099-09-10T14:30:00+00:00",
    clinicTimeZone: "America/Lima",
    createdAt: "2099-09-01T18:00:00+00:00",
    ...options,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function renderAppointments() {
  return render(<AppointmentsView />);
}

beforeEach(() => {
  provider.activePatient = primaryPatient;
  provider.patients = [primaryPatient, managedPatient];
  provider.refreshPatients.mockReset().mockResolvedValue(provider.patients);
  vi.spyOn(beeexyPhase8Api, "listAppointments").mockResolvedValue({ items: [], nextCursor: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Phase 8.3 My Appointments", () => {
  it("keeps /appointments behind the existing authenticated route boundary", () => {
    expect(isPublicRoute("/appointments")).toBe(false);
  });

  it("loads the active PatientProfile with supported upcoming filters and renders server order", async () => {
    const first = appointment("appointment-1", { startsAt: "2099-09-10T14:00:00Z", endsAt: "2099-09-10T14:30:00Z" });
    const second = appointment("appointment-2", { startsAt: "2099-09-11T14:00:00Z", endsAt: "2099-09-11T14:30:00Z", status: "Requested", modality: "virtual" });
    vi.mocked(beeexyPhase8Api.listAppointments).mockResolvedValue({ items: [first, second], nextCursor: null });

    renderAppointments();

    expect(screen.getByRole("status", { name: /loading appointments/i })).toBeInTheDocument();
    await screen.findByText("Thursday, September 10, 2099");
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Confirmed")).toBeInTheDocument();
    expect(within(cards[0]).getByText("In-person visit")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Pending confirmation")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Virtual visit")).toBeInTheDocument();

    const [query, signal] = vi.mocked(beeexyPhase8Api.listAppointments).mock.calls[0];
    expect(query).toEqual({
      patientId: primaryPatient.profileId,
      pageSize: 20,
      from: expect.any(String),
    });
    expect(query).not.toHaveProperty("status");
    expect(query).not.toHaveProperty("cursor");
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("refetches only the affected patient list after an appointment mutation event", async () => {
    const active = appointment("cancelled-from-detail");
    const cancelled = { ...active, status: "Cancelled" as const };
    vi.mocked(beeexyPhase8Api.listAppointments)
      .mockResolvedValueOnce({ items: [active], nextCursor: null })
      .mockResolvedValueOnce({ items: [cancelled], nextCursor: null })
      .mockResolvedValueOnce({ items: [cancelled], nextCursor: null });
    renderAppointments();
    await screen.findByText("Thursday, September 10, 2099");

    notifyAppointmentListChanged(managedPatient.profileId);
    await Promise.resolve();
    expect(beeexyPhase8Api.listAppointments).toHaveBeenCalledTimes(1);

    notifyAppointmentListChanged(primaryPatient.profileId);
    expect(await screen.findByRole("heading", { name: "No upcoming appointments" })).toBeInTheDocument();
    expect(vi.mocked(beeexyPhase8Api.listAppointments).mock.calls[1][0]?.patientId).toBe(primaryPatient.profileId);

    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view appointment/i })).toHaveAttribute(
      "href",
      `/appointments/${active.appointmentId}`,
    );
  });

  it("uses only supported temporal filters and resets pagination when the view changes", async () => {
    renderAppointments();
    await waitFor(() => expect(beeexyPhase8Api.listAppointments).toHaveBeenCalledTimes(1));

    const upcomingTab = screen.getByRole("tab", { name: "Upcoming" });
    upcomingTab.focus();
    fireEvent.keyDown(upcomingTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "History" })).toHaveFocus();
    await waitFor(() => expect(beeexyPhase8Api.listAppointments).toHaveBeenCalledTimes(2));
    const historyQuery = vi.mocked(beeexyPhase8Api.listAppointments).mock.calls[1][0];
    expect(historyQuery).toEqual({ patientId: primaryPatient.profileId, pageSize: 20, to: expect.any(String) });
    expect(historyQuery).not.toHaveProperty("cursor");
    expect(historyQuery).not.toHaveProperty("from");

    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    await waitFor(() => expect(beeexyPhase8Api.listAppointments).toHaveBeenCalledTimes(3));
    expect(vi.mocked(beeexyPhase8Api.listAppointments).mock.calls[2][0]).toEqual({
      patientId: primaryPatient.profileId,
      pageSize: 20,
    });
  });

  it("clears the prior patient immediately, resets the cursor, and ignores a stale response", async () => {
    const oldRequest = deferred<{ items: AppointmentSummary[]; nextCursor: string | null }>();
    const newRequest = deferred<{ items: AppointmentSummary[]; nextCursor: string | null }>();
    vi.mocked(beeexyPhase8Api.listAppointments)
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise);
    const view = renderAppointments();
    await waitFor(() => expect(beeexyPhase8Api.listAppointments).toHaveBeenCalledTimes(1));

    oldRequest.resolve({ items: [appointment("old-appointment")], nextCursor: "old-opaque-cursor" });
    await screen.findByText("Thursday, September 10, 2099");

    provider.activePatient = managedPatient;
    view.rerender(<AppointmentsView />);
    expect(screen.queryByText("Thursday, September 10, 2099")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: /loading appointments/i })).toBeInTheDocument();
    await waitFor(() => expect(beeexyPhase8Api.listAppointments).toHaveBeenCalledTimes(2));
    const switchedQuery = vi.mocked(beeexyPhase8Api.listAppointments).mock.calls[1][0]!;
    expect(switchedQuery.patientId).toBe(managedPatient.profileId);
    expect(switchedQuery).not.toHaveProperty("cursor");

    newRequest.resolve({
      items: [appointment("new-appointment", { patientId: managedPatient.profileId, startsAt: "2099-10-12T14:00:00Z", endsAt: "2099-10-12T14:30:00Z" })],
      nextCursor: null,
    });
    await screen.findByText("Monday, October 12, 2099");
    expect(screen.queryByText("Thursday, September 10, 2099")).not.toBeInTheDocument();
  });

  it("prevents a slower, abort-ignoring patient response from overwriting the active patient", async () => {
    const oldRequest = deferred<{ items: AppointmentSummary[]; nextCursor: null }>();
    const newRequest = deferred<{ items: AppointmentSummary[]; nextCursor: null }>();
    vi.mocked(beeexyPhase8Api.listAppointments)
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise);
    const view = renderAppointments();
    await waitFor(() => expect(beeexyPhase8Api.listAppointments).toHaveBeenCalledTimes(1));

    provider.activePatient = managedPatient;
    view.rerender(<AppointmentsView />);
    await waitFor(() => expect(beeexyPhase8Api.listAppointments).toHaveBeenCalledTimes(2));
    newRequest.resolve({ items: [appointment("new", { patientId: managedPatient.profileId, startsAt: "2099-10-12T14:00:00Z", endsAt: "2099-10-12T14:30:00Z" })], nextCursor: null });
    await screen.findByText("Monday, October 12, 2099");

    oldRequest.resolve({ items: [appointment("stale")], nextCursor: null });
    await Promise.resolve();
    expect(screen.queryByText("Thursday, September 10, 2099")).not.toBeInTheDocument();
    expect(screen.getByText("Monday, October 12, 2099")).toBeInTheDocument();
  });

  it("passes the opaque cursor unchanged, appends in order, and removes duplicate IDs", async () => {
    const first = appointment("appointment-1");
    const second = appointment("appointment-2", { startsAt: "2099-09-11T14:00:00Z", endsAt: "2099-09-11T14:30:00Z" });
    vi.mocked(beeexyPhase8Api.listAppointments)
      .mockResolvedValueOnce({ items: [first], nextCursor: "opaque+/=? token" })
      .mockResolvedValueOnce({ items: [first, second, second], nextCursor: null });
    renderAppointments();
    await screen.findByText("Thursday, September 10, 2099");

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Friday, September 11, 2099");
    expect(vi.mocked(beeexyPhase8Api.listAppointments).mock.calls[1][0]!.cursor).toBe("opaque+/=? token");
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("keeps existing cards and offers retry context when Load more fails", async () => {
    vi.mocked(beeexyPhase8Api.listAppointments)
      .mockResolvedValueOnce({ items: [appointment("appointment-1")], nextCursor: "next" })
      .mockRejectedValueOnce(new BeeexyNetworkError());
    renderAppointments();
    await screen.findByText("Thursday, September 10, 2099");

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Check your connection");
    expect(screen.getByText("Thursday, September 10, 2099")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
  });

  it("shows useful empty states and does not request without an active profile", async () => {
    const view = renderAppointments();
    expect(await screen.findByRole("heading", { name: "No upcoming appointments" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a doctor" })).toHaveAttribute("href", "/doctors");

    provider.activePatient = null;
    view.rerender(<AppointmentsView />);
    expect(screen.getByRole("heading", { name: "Patient profile unavailable" })).toBeInTheDocument();
    expect(beeexyPhase8Api.listAppointments).toHaveBeenCalledTimes(1);
  });

  it("renders a safe first-page error, retries, and refreshes inaccessible profiles", async () => {
    vi.mocked(beeexyPhase8Api.listAppointments)
      .mockRejectedValueOnce(new BeeexyNetworkError())
      .mockResolvedValueOnce({ items: [appointment("retried")], nextCursor: null });
    renderAppointments();
    expect(await screen.findByRole("alert")).toHaveTextContent("Check your connection");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Thursday, September 10, 2099");

    vi.mocked(beeexyPhase8Api.listAppointments).mockRejectedValueOnce(new BeeexyApiError(404, {
      problem: { errorCode: "scheduling.appointment_target_not_found" },
    }));
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    await waitFor(() => expect(provider.refreshPatients).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer available");
  });

  it("does not surface an error for an aborted obsolete request", async () => {
    vi.mocked(beeexyPhase8Api.listAppointments).mockImplementation((_query, signal) => new Promise((resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      if (_query?.patientId === managedPatient.profileId) resolve({ items: [], nextCursor: null });
    }));
    const view = renderAppointments();
    await waitFor(() => expect(beeexyPhase8Api.listAppointments).toHaveBeenCalledTimes(1));
    provider.activePatient = managedPatient;
    view.rerender(<AppointmentsView />);
    await screen.findByRole("heading", { name: "No upcoming appointments" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("labels all transport statuses and both modalities without relying on color", () => {
    const mappings: Array<[AppointmentStatus, string]> = [
      ["Requested", "Pending confirmation"],
      ["Confirmed", "Confirmed"],
      ["Cancelled", "Cancelled"],
      ["Completed", "Completed"],
      ["NoShow", "No-show"],
      ["Rejected", "Declined"],
    ];

    for (const [index, [status, label]] of mappings.entries()) {
      const { unmount } = render(<AppointmentSummaryCard appointment={appointment(`status-${index}`, { status, modality: index % 2 ? "virtual" : "inPerson" })} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(index % 2 ? "Virtual visit" : "In-person visit")).toBeInTheDocument();
      unmount();
    }
  });

  it("renders the authoritative clinic-local time and timezone", () => {
    render(<AppointmentSummaryCard appointment={appointment("timezone", {
      startsAt: "2026-09-10T14:00:00Z",
      endsAt: "2026-09-10T14:30:00Z",
      clinicTimeZone: "America/Lima",
    })} />);
    expect(screen.getByText(/9:00 AM – 9:30 AM/)).toBeInTheDocument();
    expect(screen.getByText("America/Lima clinic time")).toBeInTheDocument();
  });

  it("does not render reason, internal, or clinical fields from an expanded object", () => {
    const expanded = {
      ...appointment("private"),
      reason: "Private symptom details",
      version: 17,
      idempotencyKey: "secret-key",
      triageUrgency: "urgent",
      diagnosis: "private diagnosis",
    } as AppointmentSummary;
    render(<AppointmentSummaryCard appointment={expanded} />);
    expect(screen.queryByText("Private symptom details")).not.toBeInTheDocument();
    expect(screen.queryByText("secret-key")).not.toBeInTheDocument();
    expect(screen.queryByText("urgent")).not.toBeInTheDocument();
    expect(screen.queryByText("private diagnosis")).not.toBeInTheDocument();
  });

  it("provides labelled tabs, keyboard focus targets, directory links, and disabled loading state", async () => {
    const page = deferred<{ items: AppointmentSummary[]; nextCursor: null }>();
    vi.mocked(beeexyPhase8Api.listAppointments)
      .mockResolvedValueOnce({ items: [appointment("first")], nextCursor: "next" })
      .mockImplementationOnce(() => page.promise);
    renderAppointments();
    await screen.findByText("Thursday, September 10, 2099");
    expect(screen.getByRole("tablist", { name: "Appointment view" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upcoming" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: /doctor profile/i })).toHaveAttribute("href", expect.stringContaining("/doctors/"));
    expect(screen.getByRole("link", { name: /clinic details/i })).toHaveAttribute("href", expect.stringContaining("/clinics/"));

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getByRole("button", { name: "Loading more…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Loading more…" })).toHaveAttribute("aria-busy", "true");
    page.resolve({ items: [], nextCursor: null });
  });
});
