"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useAuth } from "@/features/auth/auth-provider";
import { RELATIONSHIP_LABELS } from "@/features/my-circle/constants";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";
import type {
  AccessiblePatient,
  AppointmentModality,
  AvailabilitySlot,
  DoctorDetail,
  RequestAppointmentResponse,
} from "@/lib/beeexy-api/contracts";
import {
  beeexyPhase8Api,
  createAppointmentIdempotencyKey,
} from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";
import {
  DOCTOR_AVAILABILITY_REFRESH_EVENT,
  doctorAvailabilityRefreshDoctorId,
} from "./appointment-refresh";

const MAX_REASON_LENGTH = 500;
const SLOT_ERROR_CODES = new Set([
  "scheduling.slot_expired",
  "scheduling.slot_unbookable",
  "scheduling.modality_mismatch",
]);

type AvailabilityState =
  | { status: "loading" }
  | { status: "ready"; slots: AvailabilitySlot[] }
  | { status: "error" };

type BookingSuccess = {
  appointment: RequestAppointmentResponse;
  patientLabel: string;
};

type BookingAttempt = {
  key: string;
  signature: string;
};

export function DoctorAvailability({ doctor }: { doctor: DoctorDetail }) {
  const { status: authStatus } = useAuth();
  const {
    activePatient,
    bootstrapStatus: patientStatus,
    patients,
    refreshPatients,
    selectActivePatient,
  } = usePatients();
  const [availability, setAvailability] = useState<AvailabilityState>({ status: "loading" });
  const [activeDay, setActiveDay] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [patientSelection, setPatientSelection] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<BookingSuccess | null>(null);
  const availabilityAbortRef = useRef<AbortController | null>(null);
  const bookingAbortRef = useRef<AbortController | null>(null);
  const availabilityRequestRef = useRef(0);
  const attemptRef = useRef<BookingAttempt | null>(null);

  const loadAvailability = useCallback(async (showLoading = true) => {
    availabilityAbortRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++availabilityRequestRef.current;
    availabilityAbortRef.current = controller;
    if (showLoading) setAvailability({ status: "loading" });

    try {
      const slots = await beeexyPhase8Api.listDoctorSlots(doctor.doctorId, {}, controller.signal);
      if (controller.signal.aborted || requestId !== availabilityRequestRef.current) return;
      setAvailability({ status: "ready", slots });
      const availableDays = groupSlotsByClinicDay(slots).map((group) => group.key);
      setActiveDay((current) => availableDays.includes(current) ? current : availableDays[0] ?? "");
      setSelectedSlotId((current) => current && slots.some((slot) => slot.slotId === current) ? current : null);
    } catch {
      if (controller.signal.aborted || requestId !== availabilityRequestRef.current) return;
      if (showLoading) setAvailability({ status: "error" });
    }
  }, [doctor.doctorId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void loadAvailability());
    return () => {
      cancelAnimationFrame(frame);
      availabilityAbortRef.current?.abort();
      bookingAbortRef.current?.abort();
    };
  }, [loadAvailability]);

  useEffect(() => {
    const refreshForDoctor = (event: Event) => {
      if (doctorAvailabilityRefreshDoctorId(event) === doctor.doctorId) void loadAvailability(false);
    };
    window.addEventListener(DOCTOR_AVAILABILITY_REFRESH_EVENT, refreshForDoctor);
    return () => window.removeEventListener(DOCTOR_AVAILABILITY_REFRESH_EVENT, refreshForDoctor);
  }, [doctor.doctorId, loadAvailability]);

  const slots = useMemo(() => availability.status === "ready" ? availability.slots : [], [availability]);
  const dateGroups = useMemo(() => groupSlotsByClinicDay(slots), [slots]);
  const selectedSlot = selectedSlotId
    ? slots.find((slot) => slot.slotId === selectedSlotId) ?? null
    : null;
  const selectedPatientId = authStatus === "authenticated" && patientSelection !== ""
    ? patients.some((patient) => patient.profileId === patientSelection)
      ? patientSelection
      : activePatient?.profileId ?? ""
    : "";
  const selectedPatient = patients.find((patient) => patient.profileId === selectedPatientId) ?? null;
  const visibleSlots = dateGroups.find((group) => group.key === activeDay)?.slots ?? [];

  function changeDay(day: string) {
    setActiveDay(day);
    setSelectedSlotId(null);
    setBookingError(null);
    setReasonError(null);
  }

  function selectSlot(slotId: string) {
    setSelectedSlotId(slotId);
    setBookingError(null);
    setReasonError(null);
  }

  function changePatient(patientId: string) {
    if (!selectActivePatient(patientId)) return;
    setPatientSelection(patientId);
    setBookingError(null);
  }

  function changeReason(value: string) {
    setReason(value);
    setReasonError(value.length > MAX_REASON_LENGTH ? `Use ${MAX_REASON_LENGTH} characters or fewer.` : null);
    setBookingError(null);
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !selectedSlot || !selectedPatient) return;

    const normalizedReason = reason.trim();
    if (normalizedReason.length > MAX_REASON_LENGTH) {
      setReasonError(`Use ${MAX_REASON_LENGTH} characters or fewer.`);
      return;
    }

    const signature = bookingSignature(selectedPatient.profileId, selectedSlot, normalizedReason);
    if (!attemptRef.current || attemptRef.current.signature !== signature) {
      attemptRef.current = { key: createAppointmentIdempotencyKey(), signature };
    }

    const controller = new AbortController();
    bookingAbortRef.current?.abort();
    bookingAbortRef.current = controller;
    setSubmitting(true);
    setBookingError(null);
    setReasonError(null);

    try {
      const appointment = await beeexyPhase8Api.createAppointment({
        patientId: selectedPatient.profileId,
        slotId: selectedSlot.slotId,
        modality: selectedSlot.modality,
        ...(normalizedReason ? { reason: normalizedReason } : {}),
        idempotencyKey: attemptRef.current.key,
      }, controller.signal);
      if (controller.signal.aborted) return;
      setSuccess({ appointment, patientLabel: displayPatientName(selectedPatient) });
      attemptRef.current = null;
      void loadAvailability(false);
    } catch (error) {
      if (controller.signal.aborted) return;
      await handleBookingError(error);
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }

  async function handleBookingError(error: unknown) {
    const code = error instanceof BeeexyApiError ? error.problem?.errorCode : undefined;

    if (code === "scheduling.slot_reserved") {
      clearInvalidSlot("That time is no longer available. Please choose another slot.");
      await loadAvailability();
      return;
    }

    if (code === "scheduling.idempotency_key_reused") {
      attemptRef.current = null;
      setBookingError("We couldn’t safely complete that request. Please try again.");
      return;
    }

    if (code && SLOT_ERROR_CODES.has(code)) {
      clearInvalidSlot("That appointment time is no longer available. Please choose another slot.");
      await loadAvailability();
      return;
    }

    if (code === "scheduling.reason_invalid") {
      attemptRef.current = null;
      setReasonError(`Enter a non-blank reason using ${MAX_REASON_LENGTH} characters or fewer, or leave it empty.`);
      return;
    }

    if (error instanceof BeeexyApiError && error.status === 404) {
      attemptRef.current = null;
      setSelectedSlotId(null);
      setPatientSelection("");
      setBookingError("That patient profile or appointment time is no longer available. Please select again.");
      await Promise.allSettled([refreshPatients(), loadAvailability()]);
      return;
    }

    if (error instanceof BeeexyApiError && error.status === 401) {
      setBookingError("Your session has ended. Sign in again to request this appointment.");
      return;
    }

    if (error instanceof BeeexyNetworkError || (error instanceof BeeexyApiError && error.status >= 500)) {
      setBookingError("We couldn’t confirm whether your request was received. Try again to safely retry the same request.");
      return;
    }

    setBookingError("We couldn’t request this appointment. Check your selections and try again.");
  }

  function clearInvalidSlot(message: string) {
    attemptRef.current = null;
    setSelectedSlotId(null);
    setBookingError(message);
  }

  function resetSuccess() {
    setSuccess(null);
    setSelectedSlotId(null);
    setReason("");
    setBookingError(null);
    setReasonError(null);
  }

  return (
    <section className="doctor-availability" aria-labelledby="doctor-availability-heading">
      <header className="availability-heading">
        <span aria-hidden="true"><Icon name="calendar" size={18} /></span>
        <div>
          <p>Appointments</p>
          <h3 id="doctor-availability-heading">Available appointments</h3>
          <small>Times are shown in each clinic’s local timezone.</small>
        </div>
      </header>

      {success ? (
        <AppointmentRequestSuccess doctor={doctor} success={success} onReset={resetSuccess} />
      ) : (
        <>
          {availability.status === "loading" && <AvailabilitySkeleton />}
          {availability.status === "error" && (
            <AvailabilityStateView
              message="Check your connection and try loading appointment times again."
              title="We couldn’t load availability."
              action={() => void loadAvailability()}
            />
          )}
          {availability.status === "ready" && slots.length === 0 && (
            <AvailabilityStateView
              message="No appointments are currently available in this date range. Check again later."
              title="No appointment times available"
            />
          )}
          {availability.status === "ready" && slots.length > 0 && (
            <>
              <AvailabilityDateSelector activeDay={activeDay} groups={dateGroups} onChange={changeDay} />
              <AvailabilitySlotList
                doctor={doctor}
                selectedSlotId={selectedSlotId}
                slots={visibleSlots}
                onSelect={selectSlot}
              />
              {bookingError && !selectedSlot && (
                <div className="booking-error-box" role="alert"><Icon name="info" size={16} /><p>{bookingError}</p></div>
              )}
              {selectedSlot && authStatus === "unauthenticated" && (
                <AuthenticationPrompt doctor={doctor} slot={selectedSlot} />
              )}
              {selectedSlot && authStatus !== "unauthenticated" && authStatus !== "authenticated" && (
                <p className="availability-inline-status" role="status">Checking your sign-in status…</p>
              )}
              {selectedSlot && authStatus === "authenticated" && patientStatus !== "ready" && (
                <p className="availability-inline-status" role="status">Loading accessible patient profiles…</p>
              )}
              {selectedSlot && authStatus === "authenticated" && patientStatus === "ready" && (
                <AppointmentBookingForm
                  bookingError={bookingError}
                  doctor={doctor}
                  onPatientChange={changePatient}
                  onReasonChange={changeReason}
                  onSubmit={submitBooking}
                  patients={patients}
                  reason={reason}
                  reasonError={reasonError}
                  selectedPatient={selectedPatient}
                  selectedSlot={selectedSlot}
                  submitting={submitting}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

export type AvailabilityDateGroup = { key: string; representative: AvailabilitySlot; slots: AvailabilitySlot[] };

export function AvailabilityDateSelector({ activeDay, groups, onChange }: {
  activeDay: string;
  groups: AvailabilityDateGroup[];
  onChange: (day: string) => void;
}) {
  return (
    <div className="availability-dates" aria-label="Available appointment dates">
      {groups.map((group) => (
        <button
          aria-pressed={activeDay === group.key}
          className={activeDay === group.key ? "selected" : ""}
          key={group.key}
          onClick={() => onChange(group.key)}
          type="button"
        >
          <span>{formatDatePart(group.representative, "weekday")}</span>
          <strong>{formatDatePart(group.representative, "day")}</strong>
          <small>{formatDatePart(group.representative, "month")}</small>
        </button>
      ))}
    </div>
  );
}

export function AvailabilitySlotList({ constraintForSlot, doctor, onSelect, selectedSlotId, slots }: {
  constraintForSlot?: (slot: AvailabilitySlot) => string | null;
  doctor: DoctorDetail;
  onSelect: (slotId: string) => void;
  selectedSlotId: string | null;
  slots: AvailabilitySlot[];
}) {
  const headingId = useId();
  if (!slots.length) return null;
  return (
    <div className="availability-slot-group" aria-labelledby={headingId} role="group">
      <div className="availability-slot-heading">
        <h4 id={headingId}>{formatLongDate(slots[0])}</h4>
        <span>{slots.length} {slots.length === 1 ? "time" : "times"}</span>
      </div>
      <div className="availability-slot-grid">
        {slots.map((slot) => {
          const location = resolveSlotLocation(doctor, slot);
          const selected = selectedSlotId === slot.slotId;
          const constraint = constraintForSlot?.(slot) ?? null;
          return (
            <button
              aria-label={`${formatTimeRange(slot)}, ${modalityLabel(slot.modality)}, ${location.clinicName}${location.locationName ? `, ${location.locationName}` : ""}, clinic time ${slot.clinicTimeZone}${constraint ? `, ${constraint}` : ""}`}
              aria-pressed={selected}
              className={`${selected ? "selected" : ""}${constraint ? " constrained" : ""}`}
              disabled={Boolean(constraint)}
              key={slot.slotId}
              onClick={() => onSelect(slot.slotId)}
              type="button"
            >
              <span className="availability-time"><strong>{formatStartTime(slot)}</strong><small>– {formatEndTime(slot)}</small></span>
              <span className="availability-modality"><Icon name={slot.modality === "virtual" ? "video" : "map-pin"} size={13} />{modalityLabel(slot.modality)}</span>
              <span className="availability-clinic">{location.clinicName}</span>
              <span className="availability-zone">Clinic time · {slot.clinicTimeZone}</span>
              {constraint && <span className="availability-slot-constraint">{constraint}</span>}
              {selected && <span className="availability-check" aria-hidden="true"><Icon name="check" size={12} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AppointmentBookingForm({
  bookingError,
  doctor,
  onPatientChange,
  onReasonChange,
  onSubmit,
  patients,
  reason,
  reasonError,
  selectedPatient,
  selectedSlot,
  submitting,
}: {
  bookingError: string | null;
  doctor: DoctorDetail;
  onPatientChange: (patientId: string) => void;
  onReasonChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  patients: AccessiblePatient[];
  reason: string;
  reasonError: string | null;
  selectedPatient: AccessiblePatient | null;
  selectedSlot: AvailabilitySlot;
  submitting: boolean;
}) {
  const patientId = useId();
  const reasonId = useId();
  const reasonHelpId = `${reasonId}-help`;
  const reasonErrorId = `${reasonId}-error`;
  const location = resolveSlotLocation(doctor, selectedSlot);

  return (
    <form className="appointment-booking-form" onSubmit={onSubmit}>
      <div className="booking-form-heading">
        <p>Review request</p>
        <h4>Who is this appointment for?</h4>
      </div>

      {patients.length > 0 ? (
        <label className="booking-patient-field" htmlFor={patientId}>
          <span>Patient profile</span>
          <select
            disabled={submitting}
            id={patientId}
            onChange={(event) => onPatientChange(event.target.value)}
            value={selectedPatient?.profileId ?? ""}
          >
            {patients.map((patient) => (
              <option key={patient.profileId} value={patient.profileId}>{patientOptionLabel(patient)}</option>
            ))}
          </select>
        </label>
      ) : (
        <p className="booking-error-box" role="alert">No accessible patient profile is available for this request.</p>
      )}

      <dl className="booking-review-list" aria-label="Appointment request summary">
        <div><dt>Doctor</dt><dd>{doctor.displayName}</dd></div>
        <div><dt>Clinic</dt><dd>{location.clinicName}{location.locationName ? ` · ${location.locationName}` : ""}</dd></div>
        <div><dt>Date and time</dt><dd>{formatFullSlot(selectedSlot)}</dd></div>
        <div><dt>Modality</dt><dd>{modalityLabel(selectedSlot.modality)}</dd></div>
        <div><dt>Status after request</dt><dd>Requested · awaiting clinic review</dd></div>
      </dl>

      <label className="booking-reason-field" htmlFor={reasonId}>
        <span><strong>Reason for visit</strong><small>Optional · Not a clinical assessment</small></span>
        <textarea
          aria-describedby={`${reasonHelpId}${reasonError ? ` ${reasonErrorId}` : ""}`}
          aria-invalid={Boolean(reasonError)}
          disabled={submitting}
          id={reasonId}
          maxLength={MAX_REASON_LENGTH}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="Briefly share what you’d like to discuss"
          value={reason}
        />
      </label>
      <div className="booking-reason-meta" id={reasonHelpId}><span>Do not include emergency information.</span><span>{reason.length}/{MAX_REASON_LENGTH}</span></div>
      {reasonError && <p className="form-message" id={reasonErrorId} role="alert">{reasonError}</p>}
      {bookingError && (
        <div className="booking-error-box" role="alert">
          <Icon name="info" size={16} />
          <div><p>{bookingError}</p>{bookingError.includes("Sign in again") && <Link href="/login">Sign in</Link>}</div>
        </div>
      )}

      <button
        aria-busy={submitting}
        className="button primary wide booking-submit"
        disabled={!selectedPatient || submitting || Boolean(reasonError)}
        type="submit"
      >
        {submitting ? "Requesting appointment…" : <>Request appointment <Icon name="chevron-right" size={15} /></>}
      </button>
      <p className="booking-submit-note">This sends a request to the clinic. The appointment is not confirmed yet.</p>
    </form>
  );
}

function AuthenticationPrompt({ doctor, slot }: { doctor: DoctorDetail; slot: AvailabilitySlot }) {
  return (
    <div className="booking-auth-prompt">
      <span aria-hidden="true"><Icon name="lock" size={18} /></span>
      <div><h4>Sign in to request this time</h4><p>{doctor.displayName} · {formatFullSlot(slot)}</p></div>
      <Link className="button primary" href="/login">Sign in</Link>
    </div>
  );
}

function AppointmentRequestSuccess({ doctor, onReset, success }: {
  doctor: DoctorDetail;
  onReset: () => void;
  success: BookingSuccess;
}) {
  const location = resolveSlotLocation(doctor, success.appointment);
  return (
    <div className="appointment-request-success" role="status" aria-live="polite">
      <span className="request-success-mark" aria-hidden="true"><Icon name="check" size={24} /></span>
      <p className="request-success-kicker">Appointment request submitted</p>
      <h4>The clinic will review your request.</h4>
      <p>You’ll receive an update after the clinic confirms or rejects this appointment request.</p>
      <dl className="booking-review-list">
        <div><dt>Status</dt><dd><span className="requested-status">{success.appointment.status}</span></dd></div>
        <div><dt>Patient</dt><dd>{success.patientLabel}</dd></div>
        <div><dt>Doctor</dt><dd>{doctor.displayName}</dd></div>
        <div><dt>Clinic</dt><dd>{location.clinicName}{location.locationName ? ` · ${location.locationName}` : ""}</dd></div>
        <div><dt>Date and time</dt><dd>{formatFullSlot(success.appointment)}</dd></div>
        <div><dt>Modality</dt><dd>{modalityLabel(success.appointment.modality)}</dd></div>
      </dl>
      <div className="request-success-actions">
        <button className="button secondary" onClick={onReset} type="button">View more times</button>
        <Link className="button primary" href="/doctors">Browse doctors</Link>
      </div>
    </div>
  );
}

export function AvailabilitySkeleton() {
  return (
    <div className="availability-skeleton" role="status" aria-label="Loading appointment availability">
      <span className="sr-only">Loading appointment availability…</span>
      <div><span /><span /><span /></div>
      <div><span /><span /></div>
    </div>
  );
}

export function AvailabilityStateView({ action, message, title }: { action?: () => void; message: string; title: string }) {
  return (
    <div className="availability-state">
      <span aria-hidden="true"><Icon name="calendar" size={20} /></span>
      <h4>{title}</h4>
      <p>{message}</p>
      {action && <button className="button secondary" onClick={action} type="button">Try again</button>}
    </div>
  );
}

export function groupSlotsByClinicDay(slots: AvailabilitySlot[]): AvailabilityDateGroup[] {
  const groups = new Map<string, AvailabilityDateGroup>();
  for (const slot of slots) {
    const key = clinicDayKey(slot);
    const group = groups.get(key);
    if (group) group.slots.push(slot);
    else groups.set(key, { key, representative: slot, slots: [slot] });
  }
  return Array.from(groups.values());
}

function clinicDayKey(slot: Pick<AvailabilitySlot, "startsAt" | "clinicTimeZone">) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: slot.clinicTimeZone,
    year: "numeric",
  }).formatToParts(new Date(slot.startsAt));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function formatDatePart(slot: AvailabilitySlot, part: "day" | "month" | "weekday") {
  return new Intl.DateTimeFormat("en-US", {
    ...(part === "day" ? { day: "numeric" as const } : {}),
    ...(part === "month" ? { month: "short" as const } : {}),
    ...(part === "weekday" ? { weekday: "short" as const } : {}),
    timeZone: slot.clinicTimeZone,
  }).format(new Date(slot.startsAt));
}

export function formatLongDate(slot: Pick<AvailabilitySlot, "startsAt" | "clinicTimeZone">) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: slot.clinicTimeZone,
    weekday: "long",
  }).format(new Date(slot.startsAt));
}

function formatStartTime(slot: Pick<AvailabilitySlot, "startsAt" | "clinicTimeZone">) {
  return formatTime(slot.startsAt, slot.clinicTimeZone);
}

function formatEndTime(slot: Pick<AvailabilitySlot, "endsAt" | "clinicTimeZone">) {
  return formatTime(slot.endsAt, slot.clinicTimeZone);
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
}

export function formatTimeRange(slot: Pick<AvailabilitySlot, "startsAt" | "endsAt" | "clinicTimeZone">) {
  return `${formatStartTime(slot)} to ${formatEndTime(slot)}`;
}

export function formatFullSlot(slot: Pick<AvailabilitySlot, "startsAt" | "endsAt" | "clinicTimeZone">) {
  return `${formatLongDate(slot)} · ${formatTimeRange(slot)} · ${slot.clinicTimeZone}`;
}

export function modalityLabel(modality: AppointmentModality) {
  return modality === "virtual" ? "Virtual" : "In person";
}

function patientOptionLabel(patient: AccessiblePatient) {
  const relationship = patient.relationship ? RELATIONSHIP_LABELS[patient.relationship.type] : "Managed profile";
  return `${displayPatientName(patient)} — ${patient.accessType === "Primary" ? "You" : relationship}`;
}

export function resolveSlotLocation(
  doctor: DoctorDetail,
  slot: Pick<AvailabilitySlot, "clinicId" | "locationId">,
) {
  const affiliation = doctor.affiliations.find((item) => (
    item.clinicId === slot.clinicId && item.location?.locationId === slot.locationId
  )) ?? doctor.affiliations.find((item) => item.clinicId === slot.clinicId);
  return {
    clinicName: affiliation?.clinicName ?? "Clinic location",
    locationName: affiliation?.location?.locationId === slot.locationId ? affiliation.location.name : null,
  };
}

function bookingSignature(patientId: string, slot: AvailabilitySlot, reason: string) {
  return JSON.stringify([patientId, slot.slotId, slot.modality, reason]);
}
