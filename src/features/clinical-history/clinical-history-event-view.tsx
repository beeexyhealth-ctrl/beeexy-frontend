"use client";

import Link from "next/link";
import { FormEvent, useCallback, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { usePatients } from "@/features/my-circle/patient-provider";
import type { ClinicalHistoryAmendment, ClinicalHistoryEventDetail } from "@/lib/beeexy-api/contracts";
import { beeexyPhase5Api } from "@/lib/beeexy-api/phase-5-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { amendmentErrorMessage, historyErrorMessage } from "./clinical-history-state";
import { useClinicalHistoryEvent } from "./use-clinical-history";

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" });

export function ClinicalHistoryEventView({ eventId }: { eventId: string }) {
  const { activePatient, refreshPatients } = usePatients();
  const patientId = activePatient?.profileId;
  const handleUnavailable = useCallback(() => refreshPatients().then(() => undefined).catch(() => undefined), [refreshPatients]);
  const event = useClinicalHistoryEvent(patientId, eventId, handleUnavailable);

  if (event.isLoading) return <EventShell><EventSkeleton /></EventShell>;
  if (event.error || !event.detail) {
    return (
      <EventShell>
        <div className="collection-empty history-empty history-error" role="alert">
          <span><Icon name="info" size={23} /></span>
          <h2>This record is unavailable</h2>
          <p>{historyErrorMessage(event.error)}</p>
          <Link className="button secondary" href="/history">Back to Clinical History</Link>
        </div>
      </EventShell>
    );
  }

  return (
    <EventShell>
      <EventDetail key={`${patientId}:${eventId}`} detail={event.detail} refresh={event.refresh} refreshPatients={handleUnavailable} />
    </EventShell>
  );
}

function EventShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page clinical-history-detail-page">
      <header className="subview-header">
        <Link className="icon-button" href="/history" aria-label="Back to Clinical History"><Icon name="arrow-left" size={17} /></Link>
        <div><h1>Clinical History event</h1><p>Original record and traceable corrections</p></div>
      </header>
      {children}
    </div>
  );
}

function EventDetail({ detail, refresh, refreshPatients }: {
  detail: ClinicalHistoryEventDetail;
  refresh: () => Promise<ClinicalHistoryEventDetail | null>;
  refreshPatients: () => void | Promise<void>;
}) {
  const [inaccessible, setInaccessible] = useState(false);
  if (inaccessible) {
    return (
      <div className="collection-empty history-empty history-error" role="alert">
        <span><Icon name="info" size={23} /></span><h2>This record is unavailable</h2><p>This record is no longer available.</p>
        <Link className="button secondary" href="/history">Back to Clinical History</Link>
      </div>
    );
  }

  return (
    <>
      <section className="history-detail-hero" aria-labelledby="original-record-heading">
        <span><Icon name="activity" size={20} /></span>
        <div><p>Original record</p><h2 id="original-record-heading">Pre-Triage</h2><time dateTime={detail.occurredAt}>{DATE_TIME_FORMAT.format(new Date(detail.occurredAt))}</time></div>
      </section>

      <section className="history-detail-section" aria-labelledby="record-metadata-heading">
        <div className="history-section-heading">
          <div><p>Authoritative source</p><h2 id="record-metadata-heading">Original event metadata</h2></div>
          <span><Icon name="lock" size={14} /> Preserved</span>
        </div>
        <dl className="history-metadata">
          <div><dt>Record type</dt><dd>Completed Pre-Triage</dd></div>
          <div><dt>Occurred</dt><dd>{DATE_TIME_FORMAT.format(new Date(detail.occurredAt))}</dd></div>
          <div><dt>Added to history</dt><dd>{DATE_TIME_FORMAT.format(new Date(detail.recordedAt))}</dd></div>
          <div><dt>Source</dt><dd>Pre-Triage episode</dd></div>
        </dl>
        <p className="history-original-note">Corrections are added below. They never replace this original record.</p>
      </section>

      <section className="history-detail-section provenance-section" aria-labelledby="provenance-heading">
        <div className="history-section-heading"><div><p>Traceability</p><h2 id="provenance-heading">Provenance</h2></div></div>
        <p>The source questionnaire and clinical rule set are frozen to the versions used when this event occurred.</p>
        <details>
          <summary>Technical traceability</summary>
          <dl className="provenance-list">
            <div><dt>Source ID</dt><dd>{detail.provenance.sourceId}</dd></div>
            <div><dt>Questionnaire version</dt><dd>{detail.provenance.questionnaireVersionId}</dd></div>
            <div><dt>Clinical rule set version</dt><dd>{detail.provenance.clinicalRuleSetVersionId}</dd></div>
          </dl>
        </details>
      </section>

      <section className="history-detail-section amendments-section" aria-labelledby="amendments-heading">
        <div className="history-section-heading"><div><p>Additive record</p><h2 id="amendments-heading">Corrections</h2></div><span>{detail.amendments.length}</span></div>
        {detail.amendments.length ? (
          <ol className="amendments-list">{detail.amendments.map((amendment, index) => <AmendmentItem amendment={amendment} index={index} key={amendment.amendmentId} />)}</ol>
        ) : <p className="amendments-empty">No corrections have been added.</p>}
        <AmendmentForm
          detail={detail}
          refresh={refresh}
          onUnavailable={async () => { setInaccessible(true); await refreshPatients(); }}
        />
      </section>
    </>
  );
}

function AmendmentItem({ amendment, index }: { amendment: ClinicalHistoryAmendment; index: number }) {
  return (
    <li><span>{index + 1}</span><div><p>{amendment.reason}</p><small>{amendment.author.beeexyId ? `Beeexy member ${amendment.author.beeexyId}` : "Beeexy member"}</small><time dateTime={amendment.createdAt}>{DATE_TIME_FORMAT.format(new Date(amendment.createdAt))}</time></div></li>
  );
}

export function createAmendmentIdempotencyKey() {
  return crypto.randomUUID();
}

function AmendmentForm({ detail, refresh, onUnavailable }: {
  detail: ClinicalHistoryEventDetail;
  refresh: () => Promise<ClinicalHistoryEventDetail | null>;
  onUnavailable: () => Promise<void>;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [success, setSuccess] = useState("");

  function beginCorrection() {
    setOpen(true);
    setSuccess("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function cancelCorrection() {
    setOpen(false); setReason(""); setIdempotencyKey(null); setFieldError(""); setSubmissionError("");
  }

  function validateReason() {
    const message = reason.trim() ? "" : "Enter a reason for this correction.";
    setFieldError(message);
    return !message;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !validateReason()) {
      if (!reason.trim()) textareaRef.current?.focus();
      return;
    }

    const normalizedReason = reason.trim();
    const submissionKey = idempotencyKey || createAmendmentIdempotencyKey();
    if (!idempotencyKey) setIdempotencyKey(submissionKey);
    setIsSubmitting(true); setSubmissionError(""); setSuccess("");

    try {
      await beeexyPhase5Api.createPreTriageAmendment(detail.source.id, { idempotencyKey: submissionKey, reason: normalizedReason });
      const refreshed = await refresh();
      if (refreshed) {
        setReason(""); setIdempotencyKey(null); setOpen(false); setSuccess("Correction added.");
      }
    } catch (error) {
      if (error instanceof BeeexyApiError && error.status === 404) {
        await onUnavailable();
        return;
      }
      if (error instanceof BeeexyApiError && error.status === 409) {
        try {
          const refreshed = await refresh();
          const reconciled = refreshed?.amendments.some((amendment) => amendment.reason.trim() === normalizedReason);
          if (reconciled) {
            setReason(""); setIdempotencyKey(null); setOpen(false); setSuccess("Correction already saved.");
            return;
          }
        } catch (refreshError) {
          if (refreshError instanceof BeeexyApiError && refreshError.status === 404) await onUnavailable();
        }
      }
      const message = amendmentErrorMessage(error);
      if (error instanceof BeeexyApiError && error.status === 422 && error.problem?.errorCode === "clinical_amendment.invalid_reason") {
        setFieldError(message);
        textareaRef.current?.focus();
      } else setSubmissionError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="amendment-entry-action">
        <button className="button secondary wide" type="button" onClick={beginCorrection}><Icon name="plus" size={15} />Add correction</button>
        {success && <p className="amendment-success" role="status"><Icon name="check" size={14} />{success}</p>}
      </div>
    );
  }

  const errorId = `${id}-error`;
  return (
    <form className="amendment-form" onSubmit={submit} noValidate>
      <div className="amendment-form-heading"><div><h3>Add a correction</h3><p>Describe why this record needs clarification. The original stays unchanged.</p></div><button className="icon-button" type="button" aria-label="Cancel correction" disabled={isSubmitting} onClick={cancelCorrection}><Icon name="close" size={16} /></button></div>
      <label htmlFor={id}>Reason for correction</label>
      <textarea
        id={id}
        ref={textareaRef}
        value={reason}
        disabled={isSubmitting}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? errorId : undefined}
        onBlur={validateReason}
        onChange={(event) => { setReason(event.target.value); if (fieldError && event.target.value.trim()) setFieldError(""); }}
        placeholder="For example: I entered the wrong duration during this Pre-Triage."
      />
      {fieldError && <p className="field-error" id={errorId} role="alert">{fieldError}</p>}
      {submissionError && <p className="amendment-form-error" role="alert">{submissionError}</p>}
      <button className="button primary wide" type="submit" disabled={isSubmitting || !reason.trim()}>{isSubmitting ? "Saving correction…" : "Save correction"}</button>
      <p className="amendment-privacy-note">Only your reason is submitted. Beeexy records the author and timestamp securely.</p>
    </form>
  );
}

function EventSkeleton() {
  return <div className="history-detail-skeleton" aria-busy="true" aria-label="Loading Clinical History event"><span /><span /><span /></div>;
}
