"use client";

import Link from "next/link";
import { useCallback, useId, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";
import type { AppointmentSummary } from "@/lib/beeexy-api/contracts";
import {
  APPOINTMENT_MODALITY_LABELS,
  APPOINTMENT_SCOPE_LABELS,
  APPOINTMENT_STATUS_LABELS,
  appointmentListErrorMessage,
  formatAppointmentDateTime,
  isInvalidAppointmentCursor,
  type AppointmentScope,
} from "./appointment-list-state";
import { useAppointments } from "./use-appointments";

const SCOPES: AppointmentScope[] = ["upcoming", "history", "all"];

export function AppointmentsView() {
  const { activePatient, refreshPatients } = usePatients();
  const [scope, setScope] = useState<AppointmentScope>("upcoming");
  const tabPanelId = useId();
  const patientId = activePatient?.profileId;
  const handleUnavailable = useCallback(
    () => refreshPatients().then(() => undefined).catch(() => undefined),
    [refreshPatients],
  );
  const appointments = useAppointments(patientId, scope, handleUnavailable);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % SCOPES.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + SCOPES.length) % SCOPES.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = SCOPES.length - 1;
    else return;

    event.preventDefault();
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']");
    tabs?.[nextIndex]?.focus();
    setScope(SCOPES[nextIndex]);
  }

  return (
    <div className="page collection-page appointments-page">
      <header className="page-header appointments-header">
        <div>
          <p className="appointments-eyebrow">Care schedule</p>
          <h1>My Appointments</h1>
          <p>{activePatient ? `Visits for ${displayPatientName(activePatient)}` : "Your upcoming and past visits"}</p>
        </div>
        <Link className="icon-button" href="/doctors" aria-label="Find a doctor to book an appointment">
          <Icon name="plus" size={18} />
        </Link>
      </header>

      <div className="collection-tabs appointments-tabs" role="tablist" aria-label="Appointment view">
        {SCOPES.map((item) => (
          <button
            aria-controls={tabPanelId}
            aria-selected={scope === item}
            className={scope === item ? "active" : ""}
            id={`${tabPanelId}-${item}`}
            key={item}
            onKeyDown={(event) => handleTabKeyDown(event, SCOPES.indexOf(item))}
            onClick={() => setScope(item)}
            role="tab"
            tabIndex={scope === item ? 0 : -1}
            type="button"
          >
            {APPOINTMENT_SCOPE_LABELS[item]}
          </button>
        ))}
      </div>

      <section
        aria-labelledby={`${tabPanelId}-${scope}`}
        id={tabPanelId}
        role="tabpanel"
        tabIndex={0}
      >
        {!patientId ? (
          <AppointmentEmpty scope={scope} patientUnavailable />
        ) : appointments.isLoading ? (
          <AppointmentListSkeleton />
        ) : appointments.error && !appointments.items.length ? (
          <AppointmentError error={appointments.error} onRetry={appointments.refresh} />
        ) : appointments.items.length ? (
          <>
            <ol className="appointment-list phase8-appointment-list" aria-label={`${APPOINTMENT_SCOPE_LABELS[scope]} appointments`}>
              {appointments.items.map((appointment) => (
                <li key={appointment.appointmentId}>
                  <AppointmentSummaryCard appointment={appointment} />
                </li>
              ))}
            </ol>

            {appointments.error && (
              <div className="appointments-inline-error" role="alert">
                <p>{appointmentListErrorMessage(appointments.error)}</p>
                {isInvalidAppointmentCursor(appointments.error) && (
                  <button className="text-button" type="button" onClick={() => void appointments.refresh()}>
                    Reload appointments
                  </button>
                )}
              </div>
            )}

            {appointments.nextCursor && (
              <button
                aria-busy={appointments.isLoadingMore}
                className="button secondary wide appointments-load-more"
                disabled={appointments.isLoadingMore}
                onClick={() => void appointments.loadMore()}
                type="button"
              >
                {appointments.isLoadingMore ? "Loading more…" : "Load more"}
              </button>
            )}
          </>
        ) : (
          <AppointmentEmpty scope={scope} />
        )}
      </section>
    </div>
  );
}

export function AppointmentSummaryCard({ appointment }: { appointment: AppointmentSummary }) {
  const formatted = formatAppointmentDateTime(appointment);
  const modalityIcon = appointment.modality === "virtual" ? "video" : "map-pin";

  return (
    <article className="appointment-summary-card">
      <div className="appointment-summary-topline">
        <span className={`appointment-status appointment-status-${appointment.status.toLowerCase()}`}>
          <span aria-hidden="true" />
          {APPOINTMENT_STATUS_LABELS[appointment.status]}
        </span>
        <span className="appointment-modality">
          <Icon name={modalityIcon} size={14} />
          {APPOINTMENT_MODALITY_LABELS[appointment.modality]}
        </span>
      </div>

      <div className="appointment-when">
        <span className="appointment-date-icon"><Icon name="calendar" size={18} /></span>
        <div>
          <h2><time dateTime={appointment.startsAt}>{formatted.date}</time></h2>
          <p>
            <Icon name="clock" size={14} />
            <time dateTime={appointment.startsAt}>{formatted.time}</time>
          </p>
          <small>{formatted.timeZone} clinic time</small>
        </div>
      </div>

      <div className="appointment-directory-links" aria-label="Appointment care team and location">
        <Link href={`/doctors/${encodeURIComponent(appointment.doctorId)}`}>
          <span><Icon name="stethoscope" size={15} /></span>
          <span><small>Care team</small><strong>Doctor profile</strong></span>
          <Icon name="chevron-right" size={14} />
        </Link>
        <Link href={`/clinics/${encodeURIComponent(appointment.clinicId)}`}>
          <span><Icon name="map-pin" size={15} /></span>
          <span><small>Clinic location</small><strong>Clinic details</strong></span>
          <Icon name="chevron-right" size={14} />
        </Link>
      </div>
    </article>
  );
}

function AppointmentListSkeleton() {
  return (
    <div className="appointments-skeleton" aria-busy="true" aria-label="Loading appointments" role="status">
      {[0, 1, 2].map((item) => <span key={item} />)}
    </div>
  );
}

function AppointmentEmpty({ scope, patientUnavailable = false }: { scope: AppointmentScope; patientUnavailable?: boolean }) {
  const copy = patientUnavailable
    ? { heading: "Patient profile unavailable", body: "Choose an available patient profile to view appointments." }
    : scope === "upcoming"
      ? { heading: "No upcoming appointments", body: "You don’t have any upcoming appointments." }
      : scope === "history"
        ? { heading: "No appointment history", body: "Past appointments will appear here." }
        : { heading: "No appointments yet", body: "You don’t have any appointments yet." };

  return (
    <div className="collection-empty appointments-empty">
      <span><Icon name="calendar" size={23} /></span>
      <h2>{copy.heading}</h2>
      <p>{copy.body}</p>
      {!patientUnavailable && <Link className="button primary" href="/doctors">Find a doctor</Link>}
    </div>
  );
}

function AppointmentError({ error, onRetry }: { error: unknown; onRetry: () => Promise<void> }) {
  return (
    <div className="collection-empty appointments-empty appointments-error" role="alert">
      <span><Icon name="info" size={23} /></span>
      <h2>Appointments unavailable</h2>
      <p>{appointmentListErrorMessage(error)}</p>
      <button className="button secondary" type="button" onClick={() => void onRetry()}>Try again</button>
    </div>
  );
}
