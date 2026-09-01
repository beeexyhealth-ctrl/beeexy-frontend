"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Icon } from "@/components/ui/icon";
import type { AppointmentDetail, AppointmentSummary } from "@/lib/beeexy-api/contracts";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";
import { canPatientCancelAppointment } from "./appointment-detail-state";
import { formatAppointmentDateTime } from "./appointment-list-state";
import {
  notifyAppointmentListChanged,
  notifyDoctorAvailabilityChanged,
} from "./appointment-refresh";

type DetailRefresh = (options?: { preserveCurrent?: boolean }) => Promise<AppointmentDetail | null>;

type CancellationState = {
  dialogOpen: boolean;
  error: string | null;
  feedback: { kind: "success" | "changed"; message: string } | null;
  notFound: boolean;
  scopeId: string;
};

const EMPTY_CANCELLATION: CancellationState = {
  dialogOpen: false,
  error: null,
  feedback: null,
  notFound: false,
  scopeId: "",
};

export function useAppointmentCancellation({
  appointmentId,
  applySummary,
  detail,
  refresh,
}: {
  appointmentId: string;
  applySummary: (summary: AppointmentSummary) => void;
  detail: AppointmentDetail | null;
  refresh: DetailRefresh;
}) {
  const [state, setState] = useState<CancellationState>(EMPTY_CANCELLATION);
  const [submittingScopeId, setSubmittingScopeId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => () => {
    requestIdRef.current += 1;
    pendingRef.current = false;
    abortRef.current?.abort();
  }, [appointmentId]);

  const open = useCallback(() => {
    if (!detail || !canPatientCancelAppointment(detail.status)) return;
    setState({ ...EMPTY_CANCELLATION, dialogOpen: true, scopeId: appointmentId });
  }, [appointmentId, detail]);

  const close = useCallback(() => {
    if (pendingRef.current) return;
    setState((current) => current.scopeId === appointmentId
      ? { ...current, dialogOpen: false, error: null }
      : current);
  }, [appointmentId]);

  const cancel = useCallback(async () => {
    if (pendingRef.current || !detail || !canPatientCancelAppointment(detail.status)) return;

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    const mutationAppointmentId = appointmentId;
    const patientId = detail.patientId;
    const doctorId = detail.doctorId;
    abortRef.current?.abort();
    abortRef.current = controller;
    pendingRef.current = true;
    setSubmittingScopeId(appointmentId);
    setState((current) => current.scopeId === appointmentId
      ? { ...current, error: null, feedback: null }
      : { ...EMPTY_CANCELLATION, dialogOpen: true, scopeId: appointmentId });

    const isStale = () => controller.signal.aborted
      || requestId !== requestIdRef.current
      || mutationAppointmentId !== appointmentId;

    try {
      const summary = await beeexyPhase8Api.cancelAppointment(mutationAppointmentId, controller.signal);
      if (isStale()) return;

      applySummary(summary);
      notifyAppointmentListChanged(summary.patientId || patientId);
      notifyDoctorAvailabilityChanged(summary.doctorId || doctorId);
      const refreshed = await refresh({ preserveCurrent: true });
      if (isStale()) return;

      setState({
        ...EMPTY_CANCELLATION,
        feedback: {
          kind: "success",
          message: refreshed
            ? "Appointment cancelled. Its latest status history has been refreshed."
            : "Appointment cancelled. Reload the details to view its latest status history.",
        },
        scopeId: appointmentId,
      });
    } catch (error) {
      if (isStale() || (error instanceof Error && error.name === "AbortError")) return;

      const errorCode = error instanceof BeeexyApiError ? error.problem?.errorCode : undefined;
      if (error instanceof BeeexyApiError
        && error.status === 409
        && errorCode === "scheduling.appointment_transition_conflict") {
        notifyAppointmentListChanged(patientId);
        const refreshed = await refresh({ preserveCurrent: true });
        if (isStale()) return;
        setState({
          ...EMPTY_CANCELLATION,
          feedback: {
            kind: "changed",
            message: refreshed
              ? "This appointment changed while you were viewing it. We’ve refreshed its current status."
              : "This appointment changed while you were viewing it, but its current status could not be refreshed.",
          },
          scopeId: appointmentId,
        });
        return;
      }

      if (error instanceof BeeexyApiError && error.status === 404) {
        setState({ ...EMPTY_CANCELLATION, notFound: true, scopeId: appointmentId });
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
        const reconciled = await refresh({ preserveCurrent: true });
        if (isStale()) return;
        if (reconciled?.status === "Cancelled") {
          notifyAppointmentListChanged(reconciled.patientId);
          notifyDoctorAvailabilityChanged(reconciled.doctorId);
          setState({
            ...EMPTY_CANCELLATION,
            feedback: {
              kind: "success",
              message: "Appointment cancelled. We confirmed its current status after reconnecting.",
            },
            scopeId: appointmentId,
          });
          return;
        }
        if (reconciled && !canPatientCancelAppointment(reconciled.status)) {
          notifyAppointmentListChanged(reconciled.patientId);
          setState({
            ...EMPTY_CANCELLATION,
            feedback: {
              kind: "changed",
              message: "The appointment status changed while the cancellation result was being checked.",
            },
            scopeId: appointmentId,
          });
          return;
        }
        setState((current) => current.scopeId === appointmentId ? {
          ...current,
          error: reconciled
            ? "We couldn’t confirm the cancellation. We checked the current appointment; review its status and try again."
            : "We couldn’t confirm the cancellation or refresh its current status. Check your connection and try again.",
        } : current);
        return;
      }

      setState((current) => current.scopeId === appointmentId ? {
        ...current,
        error: "We couldn’t cancel this appointment right now. Please try again.",
      } : current);
    } finally {
      if (requestId === requestIdRef.current) {
        pendingRef.current = false;
        setSubmittingScopeId("");
      }
    }
  }, [appointmentId, applySummary, detail, refresh]);

  const inScope = state.scopeId === appointmentId;
  return {
    cancel,
    close,
    dialogOpen: inScope && state.dialogOpen,
    error: inScope ? state.error : null,
    feedback: inScope ? state.feedback : null,
    isSubmitting: submittingScopeId === appointmentId,
    notFound: inScope && state.notFound,
    open,
  };
}

export type AppointmentCancellationController = ReturnType<typeof useAppointmentCancellation>;

export function AppointmentCancellationActions({
  cancellation,
  detail,
}: {
  cancellation: AppointmentCancellationController;
  detail: AppointmentDetail;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const eligible = canPatientCancelAppointment(detail.status);

  return (
    <>
      {(eligible || cancellation.feedback) && (
        <section className="appointment-detail-section appointment-action-section" aria-labelledby="appointment-actions-heading">
          <header className="appointment-action-heading">
            <span aria-hidden="true"><Icon name={cancellation.feedback?.kind === "success" ? "check" : "info"} size={17} /></span>
            <div>
              <p>Patient actions</p>
              <h2 id="appointment-actions-heading">Manage appointment</h2>
            </div>
          </header>

          {cancellation.feedback && (
            <div
              className={`appointment-cancellation-notice ${cancellation.feedback.kind}`}
              data-appointment-cancellation-notice
              role="status"
              tabIndex={-1}
            >
              <Icon name={cancellation.feedback.kind === "success" ? "check" : "info"} size={16} />
              <p>{cancellation.feedback.message}</p>
            </div>
          )}

          {eligible && (
            <div className="appointment-cancel-action">
              <div>
                <strong>Can’t attend this visit?</strong>
                <p>Cancellation keeps the appointment in your history.</p>
              </div>
              <button className="button danger" onClick={cancellation.open} ref={triggerRef} type="button">
                <Icon name="close" size={15} />Cancel appointment
              </button>
            </div>
          )}
        </section>
      )}

      {cancellation.dialogOpen && (
        <CancelAppointmentDialog
          cancellation={cancellation}
          detail={detail}
        />
      )}
    </>
  );
}

function CancelAppointmentDialog({
  cancellation,
  detail,
}: {
  cancellation: AppointmentCancellationController;
  detail: AppointmentDetail;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const scheduled = formatAppointmentDateTime(detail);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    keepRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector<HTMLElement>("[data-appointment-cancellation-notice]")?.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !cancellation.isSubmitting) {
      event.preventDefault();
      cancellation.close();
      return;
    }
    if (event.key !== "Tab") return;

    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
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

  return (
    <div
      className="patient-dialog-backdrop appointment-cancel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !cancellation.isSubmitting) cancellation.close();
      }}
    >
      <section
        aria-busy={cancellation.isSubmitting}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="patient-dialog appointment-cancel-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <span aria-hidden="true"><Icon name="calendar" size={22} /></span>
        <h2 id={titleId}>Cancel appointment?</h2>
        <p id={descriptionId}>
          Cancel your appointment with the booked doctor on {scheduled.date} at {scheduled.time}?
        </p>
        <dl aria-label="Appointment to cancel">
          <div><dt>Date</dt><dd>{scheduled.date}</dd></div>
          <div><dt>Time</dt><dd>{scheduled.time}</dd></div>
          <div><dt>Time zone</dt><dd>{scheduled.timeZone}</dd></div>
        </dl>
        {cancellation.error && <div className="appointment-cancel-error" role="alert"><Icon name="info" size={15} /><p>{cancellation.error}</p></div>}
        <div className="appointment-cancel-dialog-actions">
          <button
            className="button secondary"
            disabled={cancellation.isSubmitting}
            onClick={cancellation.close}
            ref={keepRef}
            type="button"
          >
            Keep appointment
          </button>
          <button
            aria-busy={cancellation.isSubmitting}
            className="button danger"
            disabled={cancellation.isSubmitting}
            onClick={() => void cancellation.cancel()}
            type="button"
          >
            {cancellation.isSubmitting ? "Cancelling…" : "Cancel appointment"}
          </button>
        </div>
      </section>
    </div>
  );
}
