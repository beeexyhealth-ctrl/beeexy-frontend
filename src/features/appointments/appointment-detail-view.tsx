"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";
import type {
  AppointmentDetail,
  AppointmentRescheduleHistoryEntry,
  AppointmentStatusHistoryEntry,
} from "@/lib/beeexy-api/contracts";
import {
  APPOINTMENT_HISTORY_ACTOR_LABELS,
  APPOINTMENT_STATUS_ACTION_LABELS,
  appointmentDetailErrorMessage,
  isAppointmentDetailNotFound,
} from "./appointment-detail-state";
import {
  APPOINTMENT_MODALITY_LABELS,
  APPOINTMENT_STATUS_LABELS,
  formatAppointmentDateTime,
  formatAppointmentInstant,
} from "./appointment-list-state";
import {
  AppointmentCancellationActions,
  useAppointmentCancellation,
} from "./appointment-cancellation";
import { useAppointmentDetail } from "./use-appointment-detail";

export function AppointmentDetailView({ appointmentId }: { appointmentId: string }) {
  const appointment = useAppointmentDetail(appointmentId);
  const { patients } = usePatients();
  const cancellation = useAppointmentCancellation({
    appointmentId,
    applySummary: appointment.applySummary,
    detail: appointment.detail,
    refresh: appointment.refresh,
  });

  if (appointment.isLoading) return <AppointmentDetailShell><AppointmentDetailSkeleton /></AppointmentDetailShell>;
  if (cancellation.notFound || isAppointmentDetailNotFound(appointment.error)) {
    return <AppointmentDetailShell><AppointmentNotFound /></AppointmentDetailShell>;
  }
  if (appointment.error || !appointment.detail) {
    return (
      <AppointmentDetailShell>
        <AppointmentDetailError error={appointment.error} onRetry={appointment.refresh} />
      </AppointmentDetailShell>
    );
  }

  const patient = patients.find((candidate) => candidate.profileId === appointment.detail?.patientId);
  const patientName = patient ? displayPatientName(patient) : "Authorized patient profile";
  return (
    <AppointmentDetailShell>
      <AppointmentDetailContent cancellation={cancellation} detail={appointment.detail} patientName={patientName} />
    </AppointmentDetailShell>
  );
}

function AppointmentDetailShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page appointment-detail-page">
      <header className="subview-header appointment-detail-header">
        <Link className="icon-button" href="/appointments" aria-label="Back to My Appointments">
          <Icon name="arrow-left" size={17} />
        </Link>
        <div>
          <p>Care schedule</p>
          <h1>Appointment details</h1>
        </div>
      </header>
      {children}
    </div>
  );
}

function AppointmentDetailContent({ cancellation, detail, patientName }: {
  cancellation: ReturnType<typeof useAppointmentCancellation>;
  detail: AppointmentDetail;
  patientName: string;
}) {
  const scheduled = formatAppointmentDateTime(detail);
  return (
    <>
      <section className="appointment-detail-hero" aria-labelledby="appointment-schedule-heading">
        <div className="appointment-detail-hero-status">
          <span className={`appointment-status appointment-status-${detail.status.toLowerCase()}`}>
            <span aria-hidden="true" />
            {APPOINTMENT_STATUS_LABELS[detail.status]}
          </span>
          <span>{APPOINTMENT_MODALITY_LABELS[detail.modality]}</span>
        </div>
        <div className="appointment-detail-hero-date">
          <span aria-hidden="true"><Icon name="calendar" size={21} /></span>
          <div>
            <p>Current schedule</p>
            <h2 id="appointment-schedule-heading"><time dateTime={detail.startsAt}>{scheduled.date}</time></h2>
            <p><time dateTime={detail.startsAt}>{scheduled.time}</time></p>
            <small>{scheduled.timeZone} clinic time</small>
          </div>
        </div>
      </section>

      <AppointmentScheduleSummary detail={detail} patientName={patientName} />
      <AppointmentCareSection detail={detail} />

      {detail.reason && (
        <section className="appointment-detail-section appointment-reason-section" aria-labelledby="appointment-reason-heading">
          <SectionHeading icon="document" eyebrow="Provided when requested" heading="Reason for visit" id="appointment-reason-heading" />
          <p>{detail.reason}</p>
        </section>
      )}

      <AppointmentCancellationActions cancellation={cancellation} detail={detail} />

      <AppointmentStatusTimeline detail={detail} />
      <AppointmentRescheduleHistory detail={detail} />
    </>
  );
}

function AppointmentScheduleSummary({ detail, patientName }: { detail: AppointmentDetail; patientName: string }) {
  const scheduled = formatAppointmentDateTime(detail);
  return (
    <section className="appointment-detail-section" aria-labelledby="appointment-overview-heading">
      <SectionHeading icon="clock" eyebrow="Authoritative appointment record" heading="Visit overview" id="appointment-overview-heading" />
      <dl className="appointment-detail-metadata">
        <div><dt>Date</dt><dd>{scheduled.date}</dd></div>
        <div><dt>Time</dt><dd>{scheduled.time}</dd></div>
        <div><dt>Time zone</dt><dd>{scheduled.timeZone}</dd></div>
        <div><dt>Visit type</dt><dd>{APPOINTMENT_MODALITY_LABELS[detail.modality]}</dd></div>
        <div><dt>Patient</dt><dd>{patientName}</dd></div>
      </dl>
    </section>
  );
}

function AppointmentCareSection({ detail }: { detail: AppointmentDetail }) {
  return (
    <section className="appointment-detail-section appointment-care-section" aria-labelledby="appointment-care-heading">
      <SectionHeading icon="stethoscope" eyebrow="Booked care references" heading="Doctor and clinic" id="appointment-care-heading" />
      <div className="appointment-care-links">
        <Link href={`/doctors/${encodeURIComponent(detail.doctorId)}`} aria-label="View booked doctor profile">
          <span aria-hidden="true"><Icon name="stethoscope" size={17} /></span>
          <span><small>Doctor</small><strong>Booked doctor profile</strong></span>
          <Icon name="chevron-right" size={14} />
        </Link>
        <Link href={`/clinics/${encodeURIComponent(detail.clinicId)}`} aria-label="View booked clinic details">
          <span aria-hidden="true"><Icon name="map-pin" size={17} /></span>
          <span><small>Clinic and location</small><strong>Booked clinic details</strong></span>
          <Icon name="chevron-right" size={14} />
        </Link>
      </div>
      <div className="appointment-location-reference">
        <Icon name="map-pin" size={14} />
        <p><strong>Booked location</strong><span>The appointment record preserves its current clinic location reference.</span></p>
      </div>
      <p className="appointment-history-resilience"><Icon name="lock" size={13} />This appointment remains readable even if a public directory listing changes.</p>
    </section>
  );
}

function AppointmentStatusTimeline({ detail }: { detail: AppointmentDetail }) {
  return (
    <section className="appointment-detail-section appointment-timeline-section" aria-labelledby="appointment-status-history-heading">
      <SectionHeading icon="history" eyebrow="Immutable activity" heading="Status history" id="appointment-status-history-heading" />
      {detail.statusHistory.length ? (
        <ol className="appointment-status-timeline" aria-label="Appointment status history">
          {detail.statusHistory.map((entry) => (
            <AppointmentStatusEvent entry={entry} timeZone={detail.clinicTimeZone} key={entry.sequence} />
          ))}
        </ol>
      ) : <p className="appointment-detail-empty-copy">No status history is available.</p>}
    </section>
  );
}

function AppointmentStatusEvent({ entry, timeZone }: { entry: AppointmentStatusHistoryEntry; timeZone: string }) {
  const occurred = formatAppointmentInstant(entry.occurredAt, timeZone);
  return (
    <li>
      <span className="appointment-timeline-marker" aria-hidden="true"><span /></span>
      <div>
        <p>{APPOINTMENT_STATUS_ACTION_LABELS[entry.action]}</p>
        <strong>{APPOINTMENT_STATUS_LABELS[entry.newStatus]}</strong>
        <small>{APPOINTMENT_HISTORY_ACTOR_LABELS[entry.actorType]}</small>
        <time dateTime={entry.occurredAt}>{occurred.label} · {occurred.timeZone}</time>
      </div>
    </li>
  );
}

function AppointmentRescheduleHistory({ detail }: { detail: AppointmentDetail }) {
  return (
    <section className="appointment-detail-section appointment-schedule-history-section" aria-labelledby="appointment-schedule-history-heading">
      <SectionHeading icon="calendar" eyebrow="Separate from status" heading="Schedule changes" id="appointment-schedule-history-heading" />
      {detail.rescheduleHistory.length ? (
        <ol className="appointment-schedule-history" aria-label="Appointment schedule changes">
          {detail.rescheduleHistory.map((entry, index) => (
            <AppointmentScheduleChange
              entry={entry}
              index={index}
              key={`${entry.occurredAt}-${index}`}
              timeZone={detail.clinicTimeZone}
            />
          ))}
        </ol>
      ) : <p className="appointment-detail-empty-copy">This appointment has not been moved.</p>}
    </section>
  );
}

function AppointmentScheduleChange({ entry, index, timeZone }: {
  entry: AppointmentRescheduleHistoryEntry;
  index: number;
  timeZone: string;
}) {
  const occurred = formatAppointmentInstant(entry.occurredAt, timeZone);
  return (
    <li>
      <span aria-hidden="true">{index + 1}</span>
      <div>
        <strong>Schedule changed</strong>
        <p>The appointment was moved to another availability slot.</p>
        <time dateTime={entry.occurredAt}>{occurred.label} · {occurred.timeZone}</time>
      </div>
    </li>
  );
}

function SectionHeading({ eyebrow, heading, icon, id }: {
  eyebrow: string;
  heading: string;
  icon: "calendar" | "clock" | "document" | "history" | "stethoscope";
  id: string;
}) {
  return (
    <header className="appointment-detail-section-heading">
      <span aria-hidden="true"><Icon name={icon} size={16} /></span>
      <div><p>{eyebrow}</p><h2 id={id}>{heading}</h2></div>
    </header>
  );
}

function AppointmentDetailSkeleton() {
  return (
    <div className="appointment-detail-skeleton" aria-busy="true" aria-label="Loading appointment details" role="status">
      <span /><span /><span /><span />
    </div>
  );
}

function AppointmentNotFound() {
  return (
    <div className="collection-empty appointments-empty appointment-detail-state">
      <span><Icon name="calendar" size={23} /></span>
      <h2>Appointment not found</h2>
      <p>This appointment is unavailable. Beeexy can’t distinguish a missing appointment from one you can’t access.</p>
      <Link className="button secondary" href="/appointments">Back to My Appointments</Link>
    </div>
  );
}

function AppointmentDetailError({ error, onRetry }: { error: unknown; onRetry: () => Promise<AppointmentDetail | null> }) {
  return (
    <div className="collection-empty appointments-empty appointments-error appointment-detail-state" role="alert">
      <span><Icon name="info" size={23} /></span>
      <h2>Appointment unavailable</h2>
      <p>{appointmentDetailErrorMessage(error)}</p>
      <button className="button secondary" type="button" onClick={() => void onRetry()}>Try again</button>
      <Link className="text-button" href="/appointments">Back to My Appointments</Link>
    </div>
  );
}
