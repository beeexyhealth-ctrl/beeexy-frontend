"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon } from "@/components/ui/icon";
import type {
  AppointmentDetail,
  AppointmentSummary,
  AvailabilitySlot,
  DoctorDetail,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase7Api } from "@/lib/beeexy-api/phase-7-api";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";
import { canPatientRescheduleAppointment } from "./appointment-detail-state";
import { formatAppointmentDateTime } from "./appointment-list-state";
import {
  AvailabilityDateSelector,
  AvailabilitySkeleton,
  AvailabilitySlotList,
  AvailabilityStateView,
  groupSlotsByClinicDay,
  modalityLabel,
  resolveSlotLocation,
} from "./doctor-availability";
import {
  notifyAppointmentListChanged,
  notifyDoctorAvailabilityChanged,
} from "./appointment-refresh";
import type { AppointmentMutationCoordinator } from "./use-appointment-mutation-coordinator";

type DetailRefresh = (options?: { preserveCurrent?: boolean }) => Promise<AppointmentDetail | null>;

type RescheduleState = {
  activeDay: string;
  availabilityStatus: "idle" | "loading" | "ready" | "error";
  doctors: DoctorDetail[];
  error: string | null;
  feedback: { kind: "success" | "changed"; message: string } | null;
  flowOpen: boolean;
  notFound: boolean;
  scopeId: string;
  selectedDoctorId: string;
  selectedSlotId: string | null;
  slots: AvailabilitySlot[];
};

const EMPTY_RESCHEDULE: RescheduleState = {
  activeDay: "",
  availabilityStatus: "idle",
  doctors: [],
  error: null,
  feedback: null,
  flowOpen: false,
  notFound: false,
  scopeId: "",
  selectedDoctorId: "",
  selectedSlotId: null,
  slots: [],
};

const SLOT_INVALIDATING_CODES = new Set([
  "scheduling.slot_expired",
  "scheduling.slot_unbookable",
  "scheduling.modality_mismatch",
]);

export function useAppointmentRescheduling({
  appointmentId,
  applySummary,
  coordinator,
  detail,
  refresh,
}: {
  appointmentId: string;
  applySummary: (summary: AppointmentSummary) => void;
  coordinator: AppointmentMutationCoordinator;
  detail: AppointmentDetail | null;
  refresh: DetailRefresh;
}) {
  const [state, setState] = useState<RescheduleState>(EMPTY_RESCHEDULE);
  const [submittingScopeId, setSubmittingScopeId] = useState("");
  const availabilityAbortRef = useRef<AbortController | null>(null);
  const availabilityRequestRef = useRef(0);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationRequestRef = useRef(0);
  const pendingRef = useRef(false);

  useEffect(() => () => {
    availabilityRequestRef.current += 1;
    mutationRequestRef.current += 1;
    pendingRef.current = false;
    availabilityAbortRef.current?.abort();
    mutationAbortRef.current?.abort();
  }, [appointmentId]);

  const loadAvailability = useCallback(async (doctorId: string, showLoading = true) => {
    availabilityAbortRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++availabilityRequestRef.current;
    availabilityAbortRef.current = controller;
    if (showLoading) {
      setState((current) => current.scopeId === appointmentId ? {
        ...current,
        activeDay: "",
        availabilityStatus: "loading",
        error: null,
        selectedDoctorId: doctorId,
        selectedSlotId: null,
        slots: [],
      } : current);
    }

    try {
      const slots = await beeexyPhase8Api.listDoctorSlots(doctorId, {}, controller.signal);
      if (controller.signal.aborted || requestId !== availabilityRequestRef.current) return null;
      const groups = groupSlotsByClinicDay(slots);
      setState((current) => current.scopeId === appointmentId ? {
        ...current,
        activeDay: groups[0]?.key ?? "",
        availabilityStatus: "ready",
        error: null,
        selectedDoctorId: doctorId,
        selectedSlotId: null,
        slots,
      } : current);
      return slots;
    } catch {
      if (controller.signal.aborted || requestId !== availabilityRequestRef.current) return null;
      setState((current) => current.scopeId === appointmentId ? {
        ...current,
        availabilityStatus: "error",
        error: "We couldn’t load appointment times. Check your connection and try again.",
        selectedSlotId: null,
      } : current);
      return null;
    }
  }, [appointmentId]);

  const loadInitialFlow = useCallback(async (current: AppointmentDetail) => {
    const controller = new AbortController();
    const requestId = ++availabilityRequestRef.current;
    availabilityAbortRef.current?.abort();
    availabilityAbortRef.current = controller;

    const [currentDoctorResult, directoryResult, slotsResult] = await Promise.allSettled([
      beeexyPhase7Api.getDoctor(current.doctorId, controller.signal),
      loadPublicDoctors(controller.signal),
      beeexyPhase8Api.listDoctorSlots(current.doctorId, {}, controller.signal),
    ]);
    if (controller.signal.aborted || requestId !== availabilityRequestRef.current) return;

    const fallback = fallbackDoctor(current);
    const currentDoctor = currentDoctorResult.status === "fulfilled" ? currentDoctorResult.value : fallback;
    const doctors = directoryResult.status === "fulfilled"
      ? mergeDoctors(currentDoctor, directoryResult.value)
      : [currentDoctor];

    if (slotsResult.status === "rejected") {
      setState((existing) => existing.scopeId === appointmentId ? {
        ...existing,
        availabilityStatus: "error",
        doctors,
        error: "We couldn’t load appointment times. Check your connection and try again.",
      } : existing);
      return;
    }

    const groups = groupSlotsByClinicDay(slotsResult.value);
    setState((existing) => existing.scopeId === appointmentId ? {
      ...existing,
      activeDay: groups[0]?.key ?? "",
      availabilityStatus: "ready",
      doctors,
      error: null,
      slots: slotsResult.value,
    } : existing);
  }, [appointmentId]);

  const open = useCallback(() => {
    if (coordinator.activeMutation || !detail || !canPatientRescheduleAppointment(detail.status)) return;
    setState({
      ...EMPTY_RESCHEDULE,
      availabilityStatus: "loading",
      flowOpen: true,
      scopeId: appointmentId,
      selectedDoctorId: detail.doctorId,
    });
    void loadInitialFlow(detail);
  }, [appointmentId, coordinator.activeMutation, detail, loadInitialFlow]);

  const close = useCallback(() => {
    if (pendingRef.current) return;
    availabilityRequestRef.current += 1;
    availabilityAbortRef.current?.abort();
    setState((current) => current.scopeId === appointmentId ? {
      ...current,
      error: null,
      flowOpen: false,
      selectedSlotId: null,
    } : current);
  }, [appointmentId]);

  const selectDoctor = useCallback((doctorId: string) => {
    if (pendingRef.current || !doctorId) return;
    void loadAvailability(doctorId);
  }, [loadAvailability]);

  const selectDay = useCallback((day: string) => {
    setState((current) => current.scopeId === appointmentId ? {
      ...current,
      activeDay: day,
      error: null,
      selectedSlotId: null,
    } : current);
  }, [appointmentId]);

  const selectSlot = useCallback((slotId: string) => {
    setState((current) => current.scopeId === appointmentId ? {
      ...current,
      error: null,
      selectedSlotId: slotId,
    } : current);
  }, [appointmentId]);

  const submit = useCallback(async () => {
    const inScope = state.scopeId === appointmentId;
    const target = inScope ? state.slots.find((slot) => slot.slotId === state.selectedSlotId) ?? null : null;
    if (
      pendingRef.current
      || !detail
      || !target
      || target.slotId === detail.slotId
      || target.modality !== detail.modality
      || !canPatientRescheduleAppointment(detail.status)
    ) return;
    if (!coordinator.acquire("reschedule")) return;

    const controller = new AbortController();
    const requestId = ++mutationRequestRef.current;
    const original = detail;
    const targetSlotId = target.slotId;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    pendingRef.current = true;
    setSubmittingScopeId(appointmentId);
    setState((current) => current.scopeId === appointmentId ? { ...current, error: null, feedback: null } : current);

    const isStale = () => controller.signal.aborted || requestId !== mutationRequestRef.current;

    try {
      const summary = await beeexyPhase8Api.rescheduleAppointment(
        appointmentId,
        { slotId: targetSlotId },
        controller.signal,
      );
      if (isStale()) return;

      applySummary(summary);
      notifyAppointmentListChanged(summary.patientId);
      notifyDoctorAvailabilityChanged(original.doctorId);
      if (summary.doctorId !== original.doctorId) notifyDoctorAvailabilityChanged(summary.doctorId);
      const refreshed = await refresh({ preserveCurrent: true });
      if (isStale()) return;

      setState({
        ...EMPTY_RESCHEDULE,
        feedback: {
          kind: "success",
          message: refreshed
            ? "Appointment rescheduled. The updated schedule and history are ready."
            : "Appointment rescheduled. Reload the details to view its latest schedule history.",
        },
        scopeId: appointmentId,
      });
    } catch (error) {
      if (isStale() || (error instanceof Error && error.name === "AbortError")) return;
      const code = error instanceof BeeexyApiError ? error.problem?.errorCode : undefined;

      if (error instanceof BeeexyApiError && error.status === 409 && code === "scheduling.slot_reserved") {
        await loadAvailability(state.selectedDoctorId, false);
        if (isStale()) return;
        setState((current) => current.scopeId === appointmentId ? {
          ...current,
          error: "That time is no longer available. Please choose another slot.",
          selectedSlotId: null,
        } : current);
        return;
      }

      if (error instanceof BeeexyApiError
        && error.status === 409
        && (code === "scheduling.appointment_reschedule_conflict"
          || code === "scheduling.appointment_transition_conflict")) {
        notifyAppointmentListChanged(original.patientId);
        const [authoritative] = await Promise.all([
          refresh({ preserveCurrent: true }),
          loadAvailability(state.selectedDoctorId, false),
        ]);
        if (isStale()) return;
        if (authoritative && !canPatientRescheduleAppointment(authoritative.status)) {
          setState({
            ...EMPTY_RESCHEDULE,
            feedback: {
              kind: "changed",
              message: "This appointment changed and can no longer be rescheduled.",
            },
            scopeId: appointmentId,
          });
        } else {
          setState((current) => current.scopeId === appointmentId ? {
            ...current,
            error: authoritative
              ? "This appointment changed while you were viewing it. Review the refreshed schedule and choose a new time again."
              : "This appointment changed, but its current schedule could not be refreshed.",
            selectedSlotId: null,
          } : current);
        }
        return;
      }

      if (error instanceof BeeexyApiError && error.status === 422 && code && SLOT_INVALIDATING_CODES.has(code)) {
        await loadAvailability(state.selectedDoctorId, false);
        if (isStale()) return;
        setState((current) => current.scopeId === appointmentId ? {
          ...current,
          error: code === "scheduling.modality_mismatch"
            ? "That time is not compatible with this appointment type. Please choose another slot."
            : "That appointment time is no longer available. Please choose another slot.",
          selectedSlotId: null,
        } : current);
        return;
      }

      if (error instanceof BeeexyApiError && error.status === 404) {
        setState({ ...EMPTY_RESCHEDULE, notFound: true, scopeId: appointmentId });
        return;
      }

      if (error instanceof BeeexyApiError && error.status === 401) {
        setState((current) => current.scopeId === appointmentId ? {
          ...current,
          error: "Your session has ended. Sign in again to continue.",
        } : current);
        return;
      }

      if (error instanceof BeeexyNetworkError || (error instanceof BeeexyApiError && error.status >= 500)) {
        const authoritative = await refresh({ preserveCurrent: true });
        if (isStale()) return;
        if (authoritative?.slotId === targetSlotId) {
          notifyAppointmentListChanged(authoritative.patientId);
          notifyDoctorAvailabilityChanged(original.doctorId);
          if (authoritative.doctorId !== original.doctorId) notifyDoctorAvailabilityChanged(authoritative.doctorId);
          setState({
            ...EMPTY_RESCHEDULE,
            feedback: {
              kind: "success",
              message: "Appointment rescheduled. We confirmed the updated schedule after reconnecting.",
            },
            scopeId: appointmentId,
          });
        } else if (authoritative?.slotId === original.slotId) {
          setState((current) => current.scopeId === appointmentId ? {
            ...current,
            error: "We couldn’t confirm the reschedule. The original appointment is still current; review the change before trying again.",
          } : current);
        } else if (authoritative) {
          notifyAppointmentListChanged(authoritative.patientId);
          setState({
            ...EMPTY_RESCHEDULE,
            feedback: {
              kind: "changed",
              message: "The appointment schedule changed while the reschedule result was being checked.",
            },
            scopeId: appointmentId,
          });
        } else {
          setState((current) => current.scopeId === appointmentId ? {
            ...current,
            error: "We couldn’t confirm the reschedule or refresh the appointment. Check your connection, then reopen this flow.",
            selectedSlotId: null,
          } : current);
        }
        return;
      }

      setState((current) => current.scopeId === appointmentId ? {
        ...current,
        error: "We couldn’t reschedule this appointment. Review the selected time and try again.",
      } : current);
    } finally {
      if (requestId === mutationRequestRef.current) {
        pendingRef.current = false;
        setSubmittingScopeId("");
        coordinator.release("reschedule");
      }
    }
  }, [appointmentId, applySummary, coordinator, detail, loadAvailability, refresh, state.scopeId, state.selectedDoctorId, state.selectedSlotId, state.slots]);

  const inScope = state.scopeId === appointmentId;
  return {
    activeDay: inScope ? state.activeDay : "",
    availabilityStatus: inScope ? state.availabilityStatus : "idle",
    close,
    doctors: inScope ? state.doctors : [],
    error: inScope ? state.error : null,
    feedback: inScope ? state.feedback : null,
    flowOpen: inScope && state.flowOpen,
    isBlocked: coordinator.activeMutation !== null && coordinator.activeMutation !== "reschedule",
    isSubmitting: submittingScopeId === appointmentId,
    loadAvailability,
    notFound: inScope && state.notFound,
    open,
    selectDay,
    selectDoctor,
    selectedDoctorId: inScope ? state.selectedDoctorId : "",
    selectedSlotId: inScope ? state.selectedSlotId : null,
    selectSlot,
    slots: inScope ? state.slots : [],
    submit,
  };
}

export type AppointmentReschedulingController = ReturnType<typeof useAppointmentRescheduling>;

export function RescheduleAppointmentDialog({
  detail,
  rescheduling,
}: {
  detail: AppointmentDetail;
  rescheduling: AppointmentReschedulingController;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const currentSchedule = formatAppointmentDateTime(detail);
  const dateGroups = useMemo(() => groupSlotsByClinicDay(rescheduling.slots), [rescheduling.slots]);
  const visibleSlots = dateGroups.find((group) => group.key === rescheduling.activeDay)?.slots ?? [];
  const currentDoctor = rescheduling.doctors.find((doctor) => doctor.doctorId === detail.doctorId)
    ?? fallbackDoctor(detail);
  const currentLocation = resolveSlotLocation(currentDoctor, detail);
  const selectedDoctor = rescheduling.doctors.find((doctor) => doctor.doctorId === rescheduling.selectedDoctorId)
    ?? fallbackDoctor(detail);
  const selectedSlot = rescheduling.slots.find((slot) => slot.slotId === rescheduling.selectedSlotId) ?? null;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector<HTMLElement>("[data-appointment-reschedule-notice]")?.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !rescheduling.isSubmitting) {
      event.preventDefault();
      rescheduling.close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function slotConstraint(slot: AvailabilitySlot) {
    if (slot.slotId === detail.slotId) return "Current appointment time";
    if (slot.modality !== detail.modality) return "Not compatible with current visit type";
    return null;
  }

  return (
    <div
      className="patient-dialog-backdrop appointment-reschedule-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !rescheduling.isSubmitting) rescheduling.close();
      }}
    >
      <section
        aria-busy={rescheduling.isSubmitting}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="patient-dialog appointment-reschedule-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header className="reschedule-dialog-header">
          <span aria-hidden="true"><Icon name="calendar" size={21} /></span>
          <div><p>Change appointment time</p><h2 id={titleId}>Reschedule appointment</h2></div>
          <button
            aria-label="Keep current appointment and close rescheduling"
            className="icon-button"
            disabled={rescheduling.isSubmitting}
            onClick={rescheduling.close}
            ref={closeRef}
            type="button"
          ><Icon name="close" size={16} /></button>
        </header>
        <p className="reschedule-dialog-description" id={descriptionId}>
          Your original appointment remains unchanged until the new time is confirmed.
        </p>

        <section className="reschedule-current" aria-labelledby="reschedule-current-heading">
          <div><p>Current schedule</p><h3 id="reschedule-current-heading">Current appointment</h3></div>
          <dl>
            <div><dt>Date</dt><dd>{currentSchedule.date}</dd></div>
            <div><dt>Time</dt><dd>{currentSchedule.time}</dd></div>
            <div><dt>Clinic time zone</dt><dd>{currentSchedule.timeZone}</dd></div>
            <div><dt>Status</dt><dd>{detail.status}</dd></div>
            <div><dt>Location</dt><dd>{currentLocation.clinicName}{currentLocation.locationName ? ` · ${currentLocation.locationName}` : ""}</dd></div>
          </dl>
        </section>

        <section className="reschedule-picker" aria-labelledby="reschedule-picker-heading">
          <div className="reschedule-picker-heading">
            <div><p>Available appointment slots</p><h3 id="reschedule-picker-heading">Choose a new time</h3></div>
            <small>Times use each clinic’s timezone.</small>
          </div>

          {rescheduling.doctors.length > 1 && (
            <label className="reschedule-doctor-field">
              <span>Doctor for the new time</span>
              <select
                disabled={rescheduling.isSubmitting}
                onChange={(event) => rescheduling.selectDoctor(event.target.value)}
                value={rescheduling.selectedDoctorId}
              >
                {rescheduling.doctors.map((doctor) => (
                  <option key={doctor.doctorId} value={doctor.doctorId}>{doctor.displayName}</option>
                ))}
              </select>
            </label>
          )}

          {rescheduling.availabilityStatus === "loading" && <AvailabilitySkeleton />}
          {rescheduling.availabilityStatus === "error" && (
            <AvailabilityStateView
              action={() => void rescheduling.loadAvailability(rescheduling.selectedDoctorId)}
              message="Check your connection and try loading appointment times again."
              title="We couldn’t load availability."
            />
          )}
          {rescheduling.availabilityStatus === "ready" && rescheduling.slots.length === 0 && (
            <AvailabilityStateView
              message="No eligible times are currently available for this doctor."
              title="No appointment times available"
            />
          )}
          {rescheduling.availabilityStatus === "ready" && rescheduling.slots.length > 0 && (
            <>
              <AvailabilityDateSelector
                activeDay={rescheduling.activeDay}
                groups={dateGroups}
                onChange={rescheduling.selectDay}
              />
              <AvailabilitySlotList
                constraintForSlot={slotConstraint}
                doctor={selectedDoctor}
                onSelect={rescheduling.selectSlot}
                selectedSlotId={rescheduling.selectedSlotId}
                slots={visibleSlots}
              />
            </>
          )}
          {rescheduling.error && <div className="appointment-reschedule-error" role="alert"><Icon name="info" size={16} /><p>{rescheduling.error}</p></div>}
        </section>

        {selectedSlot && (
          <RescheduleReview
            current={detail}
            currentDoctor={currentDoctor}
            doctor={selectedDoctor}
            onClose={rescheduling.close}
            onSubmit={rescheduling.submit}
            submitting={rescheduling.isSubmitting}
            target={selectedSlot}
          />
        )}
      </section>
    </div>
  );
}

function RescheduleReview({ current, currentDoctor, doctor, onClose, onSubmit, submitting, target }: {
  current: AppointmentDetail;
  currentDoctor: DoctorDetail;
  doctor: DoctorDetail;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  target: AvailabilitySlot;
}) {
  const currentSchedule = formatAppointmentDateTime(current);
  const currentLocation = resolveSlotLocation(currentDoctor, current);
  const targetSchedule = formatAppointmentDateTime(target);
  const targetLocation = resolveSlotLocation(doctor, target);

  return (
    <section className="reschedule-review" aria-labelledby="reschedule-review-heading">
      <div className="reschedule-review-heading"><p>Review change</p><h3 id="reschedule-review-heading">Current and new schedule</h3></div>
      <div className="reschedule-comparison">
        <article aria-labelledby="reschedule-review-current">
          <span>Current</span>
          <h4 id="reschedule-review-current">{currentSchedule.date}</h4>
          <p>{currentSchedule.time}</p>
          <small>{currentLocation.clinicName}{currentLocation.locationName ? ` · ${currentLocation.locationName}` : ""}</small>
          <small>{modalityLabel(current.modality)} · {currentSchedule.timeZone}</small>
        </article>
        <span aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
        <article aria-labelledby="reschedule-review-new">
          <span>New</span>
          <h4 id="reschedule-review-new">{targetSchedule.date}</h4>
          <p>{targetSchedule.time}</p>
          <small>{targetLocation.clinicName}{targetLocation.locationName ? ` · ${targetLocation.locationName}` : ""}</small>
          <small>{modalityLabel(target.modality)} · {targetSchedule.timeZone}</small>
        </article>
      </div>
      <p className="reschedule-transaction-note"><Icon name="lock" size={14} />The current appointment stays reserved unless this change succeeds.</p>
      <div className="reschedule-review-actions">
        <button className="button secondary" disabled={submitting} onClick={onClose} type="button">Keep current appointment</button>
        <button
          aria-busy={submitting}
          className="button primary"
          disabled={submitting}
          onClick={() => void onSubmit()}
          type="button"
        >{submitting ? "Rescheduling…" : "Confirm reschedule"}</button>
      </div>
    </section>
  );
}

function mergeDoctors(current: DoctorDetail, doctors: DoctorDetail[]) {
  const unique = new Map(doctors.map((doctor) => [doctor.doctorId, doctor]));
  unique.set(current.doctorId, current);
  return [current, ...Array.from(unique.values()).filter((doctor) => doctor.doctorId !== current.doctorId)];
}

async function loadPublicDoctors(signal: AbortSignal) {
  const doctors: DoctorDetail[] = [];
  let cursor: string | undefined;
  do {
    const page = await beeexyPhase7Api.searchDoctors(
      { pageSize: 20, ...(cursor ? { cursor } : {}) },
      signal,
    );
    doctors.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && !signal.aborted);
  return doctors;
}

function fallbackDoctor(detail: AppointmentDetail): DoctorDetail {
  return {
    doctorId: detail.doctorId,
    code: "booked-doctor",
    displayName: "Booked doctor",
    specialties: [],
    languages: [],
    affiliations: [{
      clinicId: detail.clinicId,
      clinicCode: "booked-clinic",
      clinicName: "Booked clinic",
      location: {
        locationId: detail.locationId,
        name: "Current location",
        locality: "",
        administrativeArea: "",
        country: "",
        timeZone: detail.clinicTimeZone,
      },
    }],
    storedInsuranceParticipations: [],
    credentials: [],
  };
}
