"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Icon } from "@/components/ui/icon";
import { historyErrorMessage } from "@/features/clinical-history/clinical-history-state";
import { useClinicalHistory } from "@/features/clinical-history/use-clinical-history";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";
import { usePreTriage } from "@/features/pre-triage/pre-triage-provider";
import type {
  AiDocument,
  ClinicalHistoryItem,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { AiTemporaryDocumentUploader } from "./ai-temporary-document-uploader";
import {
  SECOND_OPINION_HISTORY_MAX_SELECTIONS,
  SECOND_OPINION_TEXT_MAX_LENGTH,
  buildSecondOpinionRequest,
  formatSecondOpinionDate,
  hasSecondOpinionSource,
  isUsableAiDocument,
  secondOpinionSubmissionError,
  type SelectedPreTriage,
  type SecondOpinionRequestDraft,
} from "./second-opinion-request-state";
import {
  aiDocumentTypeLabel,
  formatAiDocumentDate,
  formatAiDocumentSize,
} from "./ai-temporary-document-state";

type Step = "case" | "context" | "review";

const STEPS: ReadonlyArray<{ key: Step; label: string }> = [
  { key: "case", label: "Patient + case" },
  { key: "context", label: "Additional information" },
  { key: "review", label: "Review" },
];

export function SecondOpinionRequestFlow() {
  const router = useRouter();
  const { activePatient, bootstrapStatus, patients, refreshPatients } = usePatients();
  const [step, setStep] = useState<Step>("case");
  const [selectedPatientId, setSelectedPatientId] = useState(activePatient?.profileId ?? "");
  const [caseText, setCaseText] = useState("");
  const [document, setDocument] = useState<AiDocument | null>(null);
  const [documentFilename, setDocumentFilename] = useState<string | null>(null);
  const [preTriage, setPreTriage] = useState<SelectedPreTriage | null>(null);
  const [clinicalHistory, setClinicalHistory] = useState<ClinicalHistoryItem[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);

  const selectedPatient = patients.find((patient) => patient.profileId === selectedPatientId) ?? null;
  const draft: SecondOpinionRequestDraft = {
    patientId: selectedPatient?.profileId ?? "",
    text: caseText,
    document,
    preTriage,
    clinicalHistory,
  };

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (validationError || submissionError) errorRef.current?.focus();
  }, [submissionError, validationError]);

  function showValidation(message: string) {
    setValidationError(message);
    setSubmissionError(null);
  }

  function changePatient(patientId: string) {
    setSelectedPatientId(patientId);
    setPreTriage(null);
    setClinicalHistory([]);
    setValidationError(null);
    setSubmissionError(null);
  }

  function continueToContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPatient) {
      showValidation("Choose an authorized patient profile before continuing.");
      return;
    }
    if (caseText.length > SECOND_OPINION_TEXT_MAX_LENGTH) {
      showValidation(`Keep the case description within ${SECOND_OPINION_TEXT_MAX_LENGTH.toLocaleString("en-US")} characters.`);
      return;
    }
    setValidationError(null);
    setSubmissionError(null);
    setStep("context");
  }

  function continueToReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPatient) {
      showValidation("Choose an authorized patient profile before continuing.");
      setStep("case");
      return;
    }
    if (document && !isUsableAiDocument(document)) {
      setDocument(null);
      setDocumentFilename(null);
      showValidation("The temporary document has expired. Upload another document or continue with a different source.");
      return;
    }
    if (!hasSecondOpinionSource(draft)) {
      showValidation("Add a case description or at least one item of additional information.");
      return;
    }
    setValidationError(null);
    setSubmissionError(null);
    setStep("review");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    if (!selectedPatient) {
      showValidation("Choose an authorized patient profile before submitting.");
      setStep("case");
      return;
    }
    if (document && !isUsableAiDocument(document)) {
      setDocument(null);
      setDocumentFilename(null);
      showValidation("The temporary document has expired. Upload another document or continue with a different source.");
      setStep("context");
      return;
    }
    if (!hasSecondOpinionSource(draft)) {
      showValidation("Add a case description or at least one item of additional information.");
      setStep("context");
      return;
    }

    pendingRef.current = true;
    setSubmitting(true);
    setValidationError(null);
    setSubmissionError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    let navigationStarted = false;

    try {
      const accepted = await beeexyPhase10Api.requestSecondOpinion(
        buildSecondOpinionRequest(draft),
        controller.signal,
      );
      if (!controller.signal.aborted) {
        navigationStarted = true;
        router.push(`/ai/second-opinions/${encodeURIComponent(accepted.analysisId)}`);
      }
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
      const mapped = secondOpinionSubmissionError(caught);
      if (mapped.clearDocument) {
        setDocument(null);
        setDocumentFilename(null);
      }
      if (mapped.clearPreTriage) setPreTriage(null);
      if (mapped.clearClinicalHistory) setClinicalHistory([]);
      if (caught instanceof BeeexyApiError && caught.status === 404) {
        void refreshPatients().catch(() => undefined);
      }
      setStep(mapped.destination);
      setSubmissionError(mapped.message);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!navigationStarted) {
        pendingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  const stepIndex = STEPS.findIndex((item) => item.key === step);

  return (
    <div className="page second-opinion-request-page">
      <header className="second-opinion-request-header">
        <Link className="back-link" href="/home"><Icon name="arrow-left" size={16} />Home</Link>
        <div className="second-opinion-request-title">
          <span aria-hidden="true"><Icon name="sparkles" size={22} /></span>
          <div>
            <p className="eyebrow">AI-assisted educational review</p>
            <h1>Request a Second Opinion</h1>
            <p>Bring together the information you want Beeexy to review.</p>
          </div>
        </div>
      </header>

      <aside className="second-opinion-safety-note" aria-label="Second Opinion guidance">
        <Icon name="shield" size={17} />
        <p>This feature provides educational information, not a diagnosis, medical consultation, treatment plan, or emergency assessment.</p>
      </aside>

      <ol className="second-opinion-steps" aria-label="Second Opinion request progress">
        {STEPS.map((item, index) => (
          <li
            aria-current={item.key === step ? "step" : undefined}
            className={index < stepIndex ? "complete" : item.key === step ? "current" : ""}
            key={item.key}
          >
            <span>{index < stepIndex ? <Icon name="check" size={12} /> : index + 1}</span>
            <small>{item.label}</small>
          </li>
        ))}
      </ol>

      {(validationError || submissionError) && (
        <div
          aria-labelledby="second-opinion-error-title"
          className="second-opinion-error-summary"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          <Icon name="info" size={17} />
          <div>
            <h2 id="second-opinion-error-title">Review this request</h2>
            <p>{validationError || submissionError}</p>
          </div>
        </div>
      )}

      {step === "case" && (
        <form aria-label="Patient and case" className="second-opinion-step-card" onSubmit={continueToContext}>
          <StepHeading
            eyebrow="Step 1 of 3"
            headingRef={headingRef}
            title="Who and what should Beeexy review?"
          >
            Choose an authorized patient, then add a written description now or supporting information in the next step.
          </StepHeading>

          <div className="second-opinion-field">
            <label htmlFor="second-opinion-patient">Patient <span aria-hidden="true">*</span><span className="sr-only">required</span></label>
            <select
              aria-describedby={`second-opinion-patient-help${validationError || submissionError ? " second-opinion-error-title" : ""}`}
              aria-invalid={Boolean(validationError || submissionError) || undefined}
              disabled={submitting || bootstrapStatus === "loading"}
              id="second-opinion-patient"
              onChange={(event) => changePatient(event.target.value)}
              required
              value={selectedPatient?.profileId ?? ""}
            >
              <option value="">Choose a patient</option>
              {patients.map((patient) => (
                <option key={patient.profileId} value={patient.profileId}>
                  {displayPatientName(patient)} — {patient.accessType === "Primary" ? "You" : "Managed profile"}
                </option>
              ))}
            </select>
            <small id="second-opinion-patient-help">Only profiles currently available through My Circle are shown.</small>
          </div>

          <div className="second-opinion-field">
            <div className="second-opinion-label-row">
              <label htmlFor="second-opinion-case">Describe the case <span>Optional with additional information</span></label>
              <small aria-live="polite">{caseText.length.toLocaleString("en-US")} / {SECOND_OPINION_TEXT_MAX_LENGTH.toLocaleString("en-US")}</small>
            </div>
            <textarea
              aria-describedby={`second-opinion-case-help${validationError || submissionError ? " second-opinion-error-title" : ""}`}
              aria-invalid={Boolean(validationError || submissionError) || undefined}
              id="second-opinion-case"
              maxLength={SECOND_OPINION_TEXT_MAX_LENGTH}
              onChange={(event) => {
                setCaseText(event.target.value);
                setValidationError(null);
                setSubmissionError(null);
              }}
              placeholder="Share symptoms, concerns, previous information, or questions you want Beeexy to review."
              rows={8}
              value={caseText}
            />
            <small id="second-opinion-case-help">Beeexy does not rewrite or classify your description in the browser.</small>
          </div>

          <div className="second-opinion-step-actions end">
            <button className="button primary" disabled={submitting || !selectedPatient} type="submit">
              Continue to additional information <Icon name="chevron-right" size={15} />
            </button>
          </div>
        </form>
      )}

      {step === "context" && selectedPatient && (
        <form aria-label="Additional information" className="second-opinion-step-card" onSubmit={continueToReview}>
          <StepHeading
            eyebrow="Step 2 of 3"
            headingRef={headingRef}
            title="Add information that may help"
          >
            Every option is optional, but the request needs a written description or at least one source.
          </StepHeading>

          <AiTemporaryDocumentUploader
            disabled={submitting}
            filename={documentFilename}
            onChange={(nextDocument) => {
              setDocument(nextDocument);
              setValidationError(null);
              setSubmissionError(null);
            }}
            onFilenameChange={setDocumentFilename}
            value={document}
          />

          <PreTriagePicker
            disabled={submitting}
            onChange={(selection) => {
              setPreTriage(selection);
              setValidationError(null);
              setSubmissionError(null);
            }}
            patientId={selectedPatient.profileId}
            value={preTriage}
          />

          <ClinicalHistoryPicker
            disabled={submitting}
            onChange={(selection) => {
              setClinicalHistory(selection);
              setValidationError(null);
              setSubmissionError(null);
            }}
            patientId={selectedPatient.profileId}
            value={clinicalHistory}
          />

          <div className="second-opinion-step-actions">
            <button className="button secondary" disabled={submitting} onClick={() => setStep("case")} type="button">
              Back
            </button>
            <button className="button primary" disabled={submitting || !hasSecondOpinionSource(draft)} type="submit">
              Review request <Icon name="chevron-right" size={15} />
            </button>
          </div>
        </form>
      )}

      {step === "review" && selectedPatient && (
        <form aria-busy={submitting} aria-label="Review Second Opinion request" className="second-opinion-step-card" onSubmit={submit}>
          <StepHeading eyebrow="Step 3 of 3" headingRef={headingRef} title="Review what will be sent">
            Confirm the inputs below. Beeexy has not analyzed or interpreted them yet.
          </StepHeading>

          <dl className="second-opinion-review-list">
            <div>
              <dt><Icon name="user" size={16} />Patient</dt>
              <dd>{displayPatientName(selectedPatient)} <small>{selectedPatient.accessType === "Primary" ? "You" : "Managed profile"}</small></dd>
            </div>
            <div>
              <dt><Icon name="message" size={16} />Case description</dt>
              <dd className="case-copy">{caseText.trim() || "No written description added."}</dd>
            </div>
            <div>
              <dt><Icon name="document" size={16} />Additional information</dt>
              <dd>
                <ReviewSources
                  clinicalHistory={clinicalHistory}
                  document={document}
                  documentFilename={documentFilename}
                  preTriage={preTriage}
                />
              </dd>
            </div>
          </dl>

          <aside className="second-opinion-submit-note">
            <Icon name="lock" size={16} />
            <p>Your draft remains only in this screen until you submit it. Beeexy may finish the AI-assisted review before acknowledging the request.</p>
          </aside>

          <div className="second-opinion-step-actions">
            <button className="button secondary" disabled={submitting} onClick={() => setStep("context")} type="button">Back</button>
            <button aria-busy={submitting} className="button primary" disabled={submitting} type="submit">
              {submitting ? "Requesting…" : "Request Second Opinion"}
              {!submitting && <Icon name="sparkles" size={15} />}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function StepHeading({
  children,
  eyebrow,
  headingRef,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  title: string;
}) {
  return (
    <header className="second-opinion-step-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2 ref={headingRef} tabIndex={-1}>{title}</h2>
      <p>{children}</p>
    </header>
  );
}

function PreTriagePicker({
  disabled,
  onChange,
  patientId,
  value,
}: {
  disabled: boolean;
  onChange: (selection: SelectedPreTriage | null) => void;
  patientId: string;
  value: SelectedPreTriage | null;
}) {
  const { active, hydrated } = usePreTriage();
  const eligible = active?.mode === "authenticated"
    && active.patientId === patientId
    && active.result
    ? active
    : null;
  const selection = eligible ? {
    completedAt: eligible.result!.completedAt,
    label: eligible.result!.primarySymptom.display,
    sessionId: eligible.sessionId,
  } satisfies SelectedPreTriage : null;

  return (
    <fieldset className="second-opinion-context-group">
      <legend><Icon name="activity" size={18} /><span>Pre-Triage <small>Optional</small></span></legend>
      <p>Use the completed authenticated Pre-Triage currently available for this patient.</p>
      {!hydrated ? (
        <div className="second-opinion-context-loading" role="status">Checking available Pre-Triage information…</div>
      ) : selection ? (
        <label className="second-opinion-context-option">
          <input
            checked={value?.sessionId === selection.sessionId}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked ? selection : null)}
            type="checkbox"
          />
          <span>
            <strong>{selection.label} Pre-Triage</strong>
            <small>Completed {formatSecondOpinionDate(selection.completedAt)}</small>
          </span>
        </label>
      ) : (
        <div className="second-opinion-context-empty">No completed Pre-Triage information is available for this patient in the current session.</div>
      )}
    </fieldset>
  );
}

function ClinicalHistoryPicker({
  disabled,
  onChange,
  patientId,
  value,
}: {
  disabled: boolean;
  onChange: (selection: ClinicalHistoryItem[]) => void;
  patientId: string;
  value: ClinicalHistoryItem[];
}) {
  const { refreshPatients } = usePatients();
  const onUnavailable = useCallback(
    () => refreshPatients().then(() => undefined).catch(() => undefined),
    [refreshPatients],
  );
  const history = useClinicalHistory(patientId, onUnavailable);
  const selectedIds = new Set(value.map((item) => item.eventId));

  function toggle(item: ClinicalHistoryItem, checked: boolean) {
    const nextIds = new Set(selectedIds);
    if (checked) nextIds.add(item.eventId);
    else nextIds.delete(item.eventId);
    const ordered = history.items.filter((candidate) => nextIds.has(candidate.eventId));
    onChange(ordered.slice(0, SECOND_OPINION_HISTORY_MAX_SELECTIONS));
  }

  return (
    <fieldset className="second-opinion-context-group">
      <legend><Icon name="history" size={18} /><span>Clinical History <small>Optional · up to {SECOND_OPINION_HISTORY_MAX_SELECTIONS}</small></span></legend>
      <p>Select completed records from this patient’s Clinical History. Beeexy receives their event references, not a browser-built clinical summary.</p>

      {history.isLoading ? (
        <div className="second-opinion-context-loading" role="status">Loading Clinical History…</div>
      ) : history.error && history.items.length === 0 ? (
        <div className="second-opinion-context-error" role="alert">
          <p>{historyErrorMessage(history.error)}</p>
          <button className="text-button" onClick={() => void history.refresh()} type="button">Try again</button>
        </div>
      ) : history.items.length === 0 ? (
        <div className="second-opinion-context-empty">No Clinical History information is available for this patient.</div>
      ) : (
        <>
          <div className="second-opinion-context-options">
            {history.items.map((item) => {
              const checked = selectedIds.has(item.eventId);
              const atLimit = value.length >= SECOND_OPINION_HISTORY_MAX_SELECTIONS && !checked;
              return (
                <label className="second-opinion-context-option" key={item.eventId}>
                  <input
                    checked={checked}
                    disabled={disabled || atLimit}
                    onChange={(event) => toggle(item, event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <strong>Completed Pre-Triage record</strong>
                    <small>{formatSecondOpinionDate(item.occurredAt)}</small>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="second-opinion-selection-count" aria-live="polite">
            {value.length} of {SECOND_OPINION_HISTORY_MAX_SELECTIONS} selected
          </p>
          {history.error && <div className="second-opinion-context-error" role="alert"><p>{historyErrorMessage(history.error)}</p></div>}
          {history.nextCursor && !history.error && (
            <button
              className="button secondary wide"
              disabled={disabled || history.isLoadingMore}
              onClick={() => void history.loadMore()}
              type="button"
            >
              {history.isLoadingMore ? "Loading more…" : "Load more Clinical History"}
            </button>
          )}
        </>
      )}
    </fieldset>
  );
}

function ReviewSources({
  clinicalHistory,
  document,
  documentFilename,
  preTriage,
}: {
  clinicalHistory: ClinicalHistoryItem[];
  document: AiDocument | null;
  documentFilename: string | null;
  preTriage: SelectedPreTriage | null;
}) {
  if (!document && !preTriage && clinicalHistory.length === 0) {
    return <span className="second-opinion-review-empty">No additional information added.</span>;
  }
  return (
    <ul className="second-opinion-review-sources">
      {document && (
        <li>
          <Icon name="check" size={14} />
          <span><strong>{documentFilename || `Temporary ${aiDocumentTypeLabel(document.contentType)} document`}</strong><small>{formatAiDocumentSize(document.sizeBytes)} · expires {formatAiDocumentDate(document.expiresAt)}</small></span>
        </li>
      )}
      {preTriage && (
        <li><Icon name="check" size={14} /><span><strong>{preTriage.label} Pre-Triage</strong><small>Completed {formatSecondOpinionDate(preTriage.completedAt)}</small></span></li>
      )}
      {clinicalHistory.map((item) => (
        <li key={item.eventId}><Icon name="check" size={14} /><span><strong>Clinical History · completed Pre-Triage</strong><small>{formatSecondOpinionDate(item.occurredAt)}</small></span></li>
      ))}
    </ul>
  );
}
