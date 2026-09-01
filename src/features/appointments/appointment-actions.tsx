"use client";

import { Icon } from "@/components/ui/icon";
import type { AppointmentDetail } from "@/lib/beeexy-api/contracts";
import {
  canPatientCancelAppointment,
  canPatientRescheduleAppointment,
} from "./appointment-detail-state";
import {
  CancelAppointmentDialog,
  type AppointmentCancellationController,
} from "./appointment-cancellation";
import {
  RescheduleAppointmentDialog,
  type AppointmentReschedulingController,
} from "./appointment-rescheduling";

export function AppointmentPatientActions({ cancellation, detail, rescheduling }: {
  cancellation: AppointmentCancellationController;
  detail: AppointmentDetail;
  rescheduling: AppointmentReschedulingController;
}) {
  const canCancel = canPatientCancelAppointment(detail.status);
  const canReschedule = canPatientRescheduleAppointment(detail.status);
  const hasFeedback = Boolean(cancellation.feedback || rescheduling.feedback);

  return (
    <>
      {(canCancel || canReschedule || hasFeedback) && (
        <section className="appointment-detail-section appointment-action-section" aria-labelledby="appointment-actions-heading">
          <header className="appointment-action-heading">
            <span aria-hidden="true"><Icon name={hasFeedback ? "check" : "settings"} size={17} /></span>
            <div><p>Patient actions</p><h2 id="appointment-actions-heading">Manage appointment</h2></div>
          </header>

          {rescheduling.feedback && (
            <div
              className={`appointment-cancellation-notice ${rescheduling.feedback.kind}`}
              data-appointment-reschedule-notice
              role="status"
              tabIndex={-1}
            ><Icon name={rescheduling.feedback.kind === "success" ? "check" : "info"} size={16} /><p>{rescheduling.feedback.message}</p></div>
          )}
          {cancellation.feedback && (
            <div
              className={`appointment-cancellation-notice ${cancellation.feedback.kind}`}
              data-appointment-cancellation-notice
              role="status"
              tabIndex={-1}
            ><Icon name={cancellation.feedback.kind === "success" ? "check" : "info"} size={16} /><p>{cancellation.feedback.message}</p></div>
          )}

          <div className="appointment-patient-action-list">
            {canReschedule && (
              <div className="appointment-patient-action reschedule">
                <span aria-hidden="true"><Icon name="calendar" size={17} /></span>
                <div><strong>Choose another time</strong><p>Your current appointment stays reserved until the change succeeds.</p></div>
                <button
                  className="button secondary"
                  disabled={rescheduling.isBlocked}
                  onClick={rescheduling.open}
                  type="button"
                >Reschedule</button>
              </div>
            )}
            {canCancel && (
              <div className="appointment-patient-action cancel">
                <span aria-hidden="true"><Icon name="close" size={17} /></span>
                <div><strong>Can’t attend this visit?</strong><p>Cancellation keeps the appointment in your history.</p></div>
                <button
                  className="button danger"
                  disabled={cancellation.isBlocked}
                  onClick={cancellation.open}
                  type="button"
                >Cancel appointment</button>
              </div>
            )}
          </div>
        </section>
      )}

      {cancellation.dialogOpen && <CancelAppointmentDialog cancellation={cancellation} detail={detail} />}
      {rescheduling.flowOpen && <RescheduleAppointmentDialog detail={detail} rescheduling={rescheduling} />}
    </>
  );
}
