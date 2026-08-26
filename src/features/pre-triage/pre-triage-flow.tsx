"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon, type IconName } from "@/components/ui/icon";
import { useAuth } from "@/features/auth/auth-provider";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";
import { AssistantMessage, ConversationHeader } from "@/features/pre-triage-chat/chat-shell";
import { useChatCompletion, type ChatCompletionState } from "@/features/pre-triage-chat/use-chat-completion";
import type {
  AdditionalSymptom,
  DurationUnit,
  NextQuestion,
  NeutralPreTriageResult,
  PreTriageConversationProjection,
  PreTriagePathway,
  QuestionnaireProgress,
  StructuredPreTriageAnswers,
  SubmitPreTriageAnswersRequest,
} from "@/lib/beeexy-api/contracts";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { intakeOutcomeMessage, preTriageErrorMessage } from "./pre-triage-errors";
import { usePreTriage } from "./pre-triage-provider";

export const SUPPORTED_PATHWAYS: ReadonlyArray<{ code: PreTriagePathway; label: string; icon: IconName }> = [
  { code: "HEADACHE", label: "Headache", icon: "brain" },
  { code: "ABDOMINAL_PAIN", label: "Stomach pain", icon: "activity" },
  { code: "CHEST_PAIN", label: "Chest pain", icon: "heart" },
  { code: "FEVER", label: "Fever", icon: "activity" },
  { code: "OTHER_SYMPTOMS", label: "Other", icon: "message" },
];

const DURATION_UNITS: DurationUnit[] = ["MINUTES", "HOURS", "DAYS", "WEEKS", "MONTHS"];
const ADDITIONAL_LABELS: Record<AdditionalSymptom, string> = { NAUSEA: "Nausea", DIARRHEA: "Diarrhea", FEVER: "Fever" };
const INITIAL_DURATION_QUESTION: NextQuestion = {
  code: "DURATION",
  prompt: "How long have you had this symptom?",
  answerType: "DURATION",
  allowedValues: [],
  allowedUnits: DURATION_UNITS,
  minimum: null,
  maximum: null,
};

export function PreTriageStartScreen() {
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const { activePatient, patients, selectActivePatient } = usePatients();
  const { abandon, active, error, hydrated, operation, start } = usePreTriage();
  const [selectedPatientId, setSelectedPatientId] = useState(activePatient?.profileId || "");
  const [selectedPathway, setSelectedPathway] = useState<PreTriagePathway | null>(null);

  const mode = authStatus === "authenticated" ? "authenticated" : "anonymous";
  const resolvedPatientId = selectedPatientId || activePatient?.profileId || "";
  const selectedPatient = patients.find((patient) => patient.profileId === resolvedPatientId) || activePatient;

  async function beginFlow() {
    if (!selectedPathway || operation) return;
    try {
      const session = await start(selectedPathway, mode, selectedPatient);
      router.push(`/pre-triage/${encodeURIComponent(session.sessionId)}`);
    } catch {
      // The provider exposes a privacy-safe error for the screen.
    }
  }

  if (!hydrated || authStatus === "bootstrapping") return <PreTriageLoading label="Preparing Pre-Triage" />;

  if (active?.mode === "anonymous" && active.sessionId) {
    return (
      <PreTriageFrame title="Pre-Triage" subtitle="Guest session" backHref="/login">
        <section className="pretriage-panel pretriage-resume" aria-labelledby="resume-title">
          <span className="pretriage-feature-icon"><Icon name="activity" size={22} /></span>
          <h2 id="resume-title">Your Pre-Triage is still available</h2>
          <p>Continue where you left off in this browser, or start again.</p>
          <Link className="button primary wide" href={resumePath(active)}>Continue Pre-Triage</Link>
          <button className="button secondary wide" type="button" onClick={abandon}>Start again</button>
        </section>
      </PreTriageFrame>
    );
  }

  return (
    <PreTriageFrame title="Start Pre-Triage" subtitle={mode === "anonymous" ? "Private guest session" : "Neutral symptom summary"} backHref={mode === "anonymous" ? "/login" : "/home"}>
      <section className="pretriage-intro" aria-labelledby="pretriage-start-title">
        <span className="pretriage-feature-icon"><Icon name="activity" size={22} /></span>
        <h1 id="pretriage-start-title">What are you feeling today?</h1>
        <p>Choose one symptom. Beeexy will organize a few details without offering a diagnosis.</p>
      </section>

      {mode === "authenticated" && patients.length > 0 && (
        <div className="pretriage-field">
          <label htmlFor="pretriage-patient">Who is this for?</label>
          <select id="pretriage-patient" value={resolvedPatientId} onChange={(event) => { setSelectedPatientId(event.target.value); selectActivePatient(event.target.value); }}>
            {patients.map((patient) => (
              <option key={patient.profileId} value={patient.profileId}>
                {displayPatientName(patient)} ({patient.accessType === "Primary" ? "You" : "Managed profile"})
              </option>
            ))}
          </select>
        </div>
      )}

      <fieldset className="pretriage-fieldset symptom-options">
        <legend>Choose a primary symptom</legend>
        {SUPPORTED_PATHWAYS.map((pathway) => (
          <label className={selectedPathway === pathway.code ? "selected" : ""} key={pathway.code}>
            <input type="radio" name="pathway" value={pathway.code} checked={selectedPathway === pathway.code} onChange={() => setSelectedPathway(pathway.code)} />
            <span><Icon name={pathway.icon} size={18} /></span><strong>{pathway.label}</strong>
            {selectedPathway === pathway.code && <Icon name="check" size={16} />}
          </label>
        ))}
      </fieldset>

      {Boolean(error) && <p className="pretriage-error" role="alert">{preTriageErrorMessage(error)}</p>}
      <button className="button primary wide pretriage-primary-action" type="button" disabled={!selectedPathway || operation !== null || (mode === "authenticated" && !selectedPatient)} onClick={() => void beginFlow()}>
        {operation === "starting" ? "Starting..." : "Continue"}
      </button>
      <p className="pretriage-neutral-note"><Icon name="shield" size={14} />This flow creates a neutral symptom summary only.</p>
    </PreTriageFrame>
  );
}

export function PreTriageIntakeScreen() {
  const router = useRouter();
  const sessionId = useSessionId();
  const { active, error, hydrated, operation, submit } = usePreTriage();
  const [feedback, setFeedback] = useState("");
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const question = questionForProgression(active?.progression);

  useEffect(() => {
    if (!hydrated) return;
    if (!active || active.sessionId !== sessionId) router.replace("/pre-triage/new");
    else if (active.progression?.state === "READY_TO_COMPLETE" && active.progression.readyToComplete) router.replace(`/pre-triage/${encodeURIComponent(sessionId)}/review`);
  }, [active, hydrated, router, sessionId]);

  useEffect(() => { questionHeadingRef.current?.focus(); }, [question?.code]);

  async function submitAnswer(request: SubmitPreTriageAnswersRequest) {
    try {
      const response = await submit(request);
      if (response.outcome !== "ACCEPTED" || "naturalLanguage" in request) setFeedback(intakeOutcomeMessage(response.outcome));
      else setFeedback("");
      if (response.progression.state === "READY_TO_COMPLETE" && response.progression.readyToComplete) router.push(`/pre-triage/${encodeURIComponent(sessionId)}/review`);
    } catch {
      // The provider exposes the error below.
    }
  }

  if (!hydrated || !active || active.sessionId !== sessionId) return <PreTriageLoading label="Loading your questions" />;
  if (!question) return <PreTriageLoading label="Preparing your review" />;

  return (
    <PreTriageFrame title="Pre-Triage" subtitle={pathwayLabel(active.pathway)} backHref="/pre-triage/new">
      <PreTriageProgress progression={active.progression} />
      <NaturalLanguageForm disabled={operation !== null} onSubmit={(naturalLanguage) => void submitAnswer({ naturalLanguage })} />
      {feedback && <p className="pretriage-notice" role="status">{feedback}</p>}
      <section className="pretriage-question" aria-live="polite">
        <p>Quick question</p>
        <h2 ref={questionHeadingRef} tabIndex={-1}>{question.prompt}</h2>
        {question.answerType === "DURATION" && <DurationQuestion disabled={operation !== null} question={question} submit={submitAnswer} />}
        {question.answerType === "INTEGER_SCALE" && <IntensityQuestion disabled={operation !== null} question={question} submit={submitAnswer} />}
        {question.answerType === "MULTIPLE_CHOICE" && <AdditionalSymptomsQuestion disabled={operation !== null} pathway={active.pathway} question={question} submit={submitAnswer} />}
      </section>
      {operation === "answering" && <p className="pretriage-loading-status" role="status">Saving your answer...</p>}
      {Boolean(error) && <p className="pretriage-error" role="alert">{preTriageErrorMessage(error)}</p>}
    </PreTriageFrame>
  );
}

function PreTriageProgress({ progression }: { progression?: QuestionnaireProgress }) {
  const answered = progression?.answeredRequiredFields.length || 0;
  const percentage = Math.min(100, 20 + Math.round((answered / 3) * 80));
  return <div className="pretriage-progress" aria-label={`${percentage}% of Pre-Triage completed`}><div className="pretriage-progress-heading"><span>Pre-Triage progress</span><strong>{percentage}%</strong></div><div className="pretriage-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-label="Pre-Triage completion"><span style={{ width: `${percentage}%` }} /></div></div>;
}

export function PreTriageReviewScreen() {
  const router = useRouter();
  const sessionId = useSessionId();
  const { status: authStatus } = useAuth();
  const { active, complete, error, hydrated, loadConversation } = usePreTriage();
  const requestedSessionRef = useRef<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const current = active?.sessionId === sessionId ? active : null;
  const projection = current?.conversation;
  const completion = useChatCompletion({
    completeSession: complete,
    projection,
    recoverConversation: loadConversation,
  });

  useEffect(() => {
    if (!hydrated || authStatus === "bootstrapping" || projection || current?.result || requestedSessionRef.current === sessionId) return;
    requestedSessionRef.current = sessionId;
    void loadConversation(sessionId)
      .catch((caught) => {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setLoadFailed(true);
      });
  }, [authStatus, current?.result, hydrated, loadConversation, projection, sessionId]);

  useEffect(() => {
    if (current?.result || completion.state.kind === "completed" || projection?.state === "COMPLETED") {
      router.replace(`/pre-triage/${encodeURIComponent(sessionId)}/result`);
      return;
    }
    if (projection && (projection.state !== "READY_FOR_REVIEW" || projection.nextInteraction)) {
      router.replace(`/pre-triage/${encodeURIComponent(sessionId)}`);
    }
  }, [completion.state.kind, current?.result, projection, router, sessionId]);

  if (!hydrated || authStatus === "bootstrapping" || (!projection && !loadFailed)) {
    return <PreTriageLoading label="Preparing your review" />;
  }
  if (!projection || loadFailed) {
    return (
      <PreTriageFrame title="Review" subtitle="Pre-Triage unavailable" backHref="/pre-triage/new">
        <section className="pretriage-panel claim-error">
          <span className="pretriage-feature-icon"><Icon name="info" size={22} /></span>
          <h1>We couldn&apos;t load this review</h1>
          <p role="alert">{preTriageErrorMessage(error)}</p>
          <button
            className="button primary wide"
            type="button"
            onClick={() => {
              requestedSessionRef.current = null;
              setLoadFailed(false);
            }}
          >
            Try again
          </button>
        </section>
      </PreTriageFrame>
    );
  }
  if (projection.state !== "READY_FOR_REVIEW" || projection.nextInteraction) {
    return <PreTriageLoading label={projection.state === "COMPLETED" ? "Opening your summary" : "Returning to your conversation"} />;
  }

  const completionLocked = completion.state.kind === "submitting"
    || completion.state.kind === "recovering"
    || completion.state.kind === "retryable"
    || completion.state.kind === "recovery-failed"
    || completion.state.kind === "blocked"
    || completion.state.kind === "completed";

  return (
    <FlowFrame className="phase4-pretriage-frame">
      <main className="chat-pretriage-shell chat-review-shell">
        <ConversationHeader backHref={`/pre-triage/${encodeURIComponent(sessionId)}`} projection={projection} />
        <div className="chat-review-body">
          <AssistantMessage text="Thanks. Your information is ready to review." />
          <section className="chat-review-card" aria-labelledby="review-heading">
            <div className="chat-review-heading">
              <span aria-hidden="true"><Icon name="document" size={20} /></span>
              <div>
                <p>Ready for review</p>
                <h2 id="review-heading">Review your information</h2>
              </div>
            </div>
            <p className="chat-review-description">Confirm the information Beeexy accepted before completing this neutral summary.</p>
            <PreTriageReviewSummary projection={projection} />
            <CompletionFeedback
              onRecoveryRetry={completion.retryRecovery}
              onRetry={completion.retryCompletion}
              state={completion.state}
            />
            <button
              className="button primary wide chat-review-complete"
              type="button"
              disabled={completionLocked}
              onClick={() => void completion.complete()}
            >
              {completion.state.kind === "submitting" ? "Completing..." : "Complete Pre-Triage"}
            </button>
            <p className="pretriage-neutral-note"><Icon name="shield" size={14} />Completion creates a neutral symptom summary. It does not provide a diagnosis.</p>
          </section>
        </div>
      </main>
    </FlowFrame>
  );
}

export function PreTriageReviewSummary({
  answers: suppliedAnswers,
  pathway,
  projection,
}: {
  answers?: StructuredPreTriageAnswers;
  pathway?: PreTriagePathway;
  projection?: PreTriageConversationProjection;
}) {
  const answers = projection?.acceptedValues || suppliedAnswers || {};
  const primarySymptom = projection?.pathway.label || (pathway ? pathwayLabel(pathway) : "Not provided");
  return (
    <dl className="pretriage-summary">
      <SummaryItem label="Primary symptom" value={primarySymptom} />
      <SummaryItem label="Duration" value={answers.duration ? `${answers.duration.value} ${unitLabel(answers.duration.unit, answers.duration.value)}` : "Not provided"} />
      <SummaryItem label="Intensity" value={answers.intensity !== undefined ? `${answers.intensity}` : "Not provided"} />
      <SummaryItem label="Additional symptoms" value={answers.additionalSymptoms ? (answers.additionalSymptoms.length ? answers.additionalSymptoms.map((item) => ADDITIONAL_LABELS[item]).join(", ") : "None") : "Not provided"} />
    </dl>
  );
}

function CompletionFeedback({
  onRecoveryRetry,
  onRetry,
  state,
}: {
  onRecoveryRetry: () => Promise<void>;
  onRetry: () => Promise<void>;
  state: ChatCompletionState;
}) {
  if (state.kind === "idle" || state.kind === "completed") return null;
  if (state.kind === "submitting") return <p className="chat-review-status" role="status">Completing your Pre-Triage</p>;
  if (state.kind === "recovering") return <p className="chat-review-status" role="status">Checking completion status</p>;
  if (state.kind === "retryable") {
    return (
      <div className="chat-review-feedback" role="status">
        <p>{state.message}</p>
        <button className="button secondary wide" type="button" onClick={() => void onRetry()}>Retry completion</button>
      </div>
    );
  }
  if (state.kind === "recovery-failed") {
    return (
      <div className="chat-review-feedback" role="alert">
        <p>{state.message}</p>
        <button className="button secondary wide" type="button" onClick={() => void onRecoveryRetry()}>Check completion status</button>
      </div>
    );
  }
  return <p className="chat-review-error" role="alert">{state.message}</p>;
}

export function PreTriageResultScreen() {
  const router = useRouter();
  const sessionId = useSessionId();
  const { active, error, hydrated, loadResult, markPendingClaim, operation } = usePreTriage();
  const requestedRef = useRef(false);
  const result = active?.sessionId === sessionId ? active.result : undefined;

  useEffect(() => {
    if (!hydrated || result || requestedRef.current) return;
    requestedRef.current = true;
    void loadResult(sessionId).catch(() => undefined);
  }, [hydrated, loadResult, result, sessionId]);

  function signInToSave() {
    try { markPendingClaim(); router.push("/login"); } catch { /* Error is exposed by the provider. */ }
  }

  if (!hydrated || (!result && operation === "loading-result")) return <PreTriageLoading label="Loading your summary" />;
  if (!result) return <PreTriageFrame title="Pre-Triage" subtitle="Result unavailable" backHref="/pre-triage/new"><UnavailableState error={error} /></PreTriageFrame>;

  const guest = active?.mode === "anonymous";
  return (
    <PreTriageFrame title="Pre-Triage complete" subtitle="Neutral summary" backHref={guest ? "/pre-triage/new" : "/home"}>
      <ResultSummary result={result} />
      {Boolean(error) && <p className="pretriage-error" role="alert">{preTriageErrorMessage(error)}</p>}
      {guest ? <button className="button primary wide pretriage-primary-action" type="button" disabled={operation !== null} onClick={signInToSave}>Sign in to save</button> : <Link className="button primary wide pretriage-primary-action" href="/home">Done</Link>}
      <p className="pretriage-neutral-note"><Icon name="info" size={14} />This summary has not been clinically reviewed.</p>
    </PreTriageFrame>
  );
}

export function PreTriageClaimScreen() {
  const sessionId = useSessionId();
  const { active, claim, claimConfirmation, claimRecovered, error, hydrated, operation } = usePreTriage();
  const { status: authStatus } = useAuth();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!hydrated || authStatus !== "authenticated" || attemptedRef.current || claimConfirmation || claimRecovered) return;
    if (!active || active.sessionId !== sessionId || !active.pendingClaim) return;
    attemptedRef.current = true;
    void claim().catch(() => undefined);
  }, [active, authStatus, claim, claimConfirmation, claimRecovered, hydrated, sessionId]);

  if (!hydrated || authStatus !== "authenticated" || operation === "claiming") return <PreTriageLoading label="Saving your Pre-Triage" />;
  if (claimConfirmation || claimRecovered) {
    return <PreTriageFrame title="Pre-Triage saved" subtitle="Beeexy profile" backHref="/home"><section className="pretriage-panel claim-success" aria-live="polite"><span className="pretriage-success-icon"><Icon name="check" size={23} /></span><h1>Saved to your Beeexy profile</h1><p>Pre-Triage saved to your primary Beeexy profile. It has not been clinically reviewed.</p><Link className="button primary wide" href={`/pre-triage/${encodeURIComponent(sessionId)}/result`}>View summary</Link><Link className="button secondary wide" href="/home">Back to Home</Link></section></PreTriageFrame>;
  }
  return <PreTriageFrame title="Save Pre-Triage" subtitle="Beeexy profile" backHref="/home"><section className="pretriage-panel claim-error"><span className="pretriage-feature-icon"><Icon name="info" size={22} /></span><h1>We could not save this Pre-Triage</h1><p role="alert">{preTriageErrorMessage(error || new BeeexyApiError(409), "claim")}</p>{active?.pendingClaim ? <button className="button primary wide" type="button" onClick={() => { attemptedRef.current = false; void claim().catch(() => undefined); }}>Try again</button> : <Link className="button primary wide" href="/pre-triage/new">Start a new Pre-Triage</Link>}</section></PreTriageFrame>;
}

function NaturalLanguageForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (value: string) => void }) {
  const id = useId();
  const [value, setValue] = useState("");
  function submitForm(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const normalized = value.trim(); if (!normalized) return; onSubmit(normalized); setValue(""); }
  return <form className="pretriage-language" onSubmit={submitForm}><label htmlFor={id}><Icon name="message" size={16} />Tell Beeexy what you’re feeling <span>Optional</span></label><textarea id={id} maxLength={4000} disabled={disabled} value={value} onChange={(event) => setValue(event.target.value)} placeholder="For example: It started yesterday, feels like a 6 out of 10, and I feel nauseous." /><button className="button secondary" type="submit" disabled={disabled || !value.trim()}><Icon name="send" size={14} />Use this description</button></form>;
}

type QuestionProps = { disabled: boolean; question: NextQuestion; submit: (request: SubmitPreTriageAnswersRequest) => void };

function DurationQuestion({ disabled, question, submit }: QuestionProps) {
  const [value, setValue] = useState("");
  const units = question.allowedUnits.length ? question.allowedUnits : DURATION_UNITS;
  const [unit, setUnit] = useState<DurationUnit>(units[0]);
  return <form className="pretriage-answer-form" onSubmit={(event) => { event.preventDefault(); submit({ structured: { duration: { value: Number(value), unit } } }); }}><div className="duration-grid"><div><label htmlFor="duration-value">Duration</label><input id="duration-value" type="number" inputMode="decimal" min="0.01" step="any" required disabled={disabled} value={value} onChange={(event) => setValue(event.target.value)} /></div><div><label htmlFor="duration-unit">Unit</label><select id="duration-unit" disabled={disabled} value={unit} onChange={(event) => setUnit(event.target.value as DurationUnit)}>{units.map((item) => <option value={item} key={item}>{unitLabel(item, 2)}</option>)}</select></div></div><button className="button primary wide" type="submit" disabled={disabled || !value || Number(value) <= 0}>Save and continue</button></form>;
}

function IntensityQuestion({ disabled, question, submit }: QuestionProps) {
  const minimum = question.minimum ?? 1;
  const maximum = question.maximum ?? 10;
  const options = useMemo(() => Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index), [maximum, minimum]);
  const [value, setValue] = useState<number | null>(null);
  const selectedValue = value ?? minimum;
  const progress = ((selectedValue - minimum) / Math.max(maximum - minimum, 1)) * 100;
  const tone = selectedValue <= 3 ? "low" : selectedValue <= 6 ? "medium" : "high";
  return <form className="pretriage-answer-form" onSubmit={(event) => { event.preventDefault(); if (value !== null) submit({ structured: { intensity: value } }); }}><fieldset className={`intensity-selector ${tone}`} style={{ "--intensity-progress": `${progress}%` } as React.CSSProperties}><legend>How intense is the pain?</legend><output className="intensity-value" htmlFor="intensity-range">{selectedValue}/10</output><div className="intensity-scale"><span>No pain</span><span>Severe pain</span></div><input id="intensity-range" name="intensity" type="range" min={minimum} max={maximum} step="1" value={selectedValue} disabled={disabled} onChange={(event) => setValue(Number(event.target.value))} aria-valuetext={`${selectedValue} out of ${maximum}, ${tone} intensity`} list="intensity-values" /><datalist id="intensity-values">{options.map((option) => <option value={option} key={option}>{option}</option>)}</datalist><div className="intensity-ticks" aria-hidden="true">{options.map((option) => <span className={selectedValue === option ? "selected" : ""} key={option}>{option}</span>)}</div></fieldset><button className={`button wide intensity-confirm ${tone}`} type="submit" disabled={disabled || value === null}><Icon name="check" size={15} />Confirm — Level {value ?? "—"}</button></form>;
}

function AdditionalSymptomsQuestion({ disabled, pathway, question, submit }: QuestionProps & { pathway: PreTriagePathway }) {
  const allowed = allowedAdditionalSymptoms(pathway, question.allowedValues);
  const [selected, setSelected] = useState<AdditionalSymptom[]>([]);
  return <form className="pretriage-answer-form" onSubmit={(event) => { event.preventDefault(); submit({ structured: { additionalSymptoms: selected } }); }}><fieldset className="additional-selector"><legend>Select all that apply. You can continue with none.</legend>{allowed.map((symptom) => <label className={selected.includes(symptom) ? "selected" : ""} key={symptom}><input type="checkbox" checked={selected.includes(symptom)} disabled={disabled} onChange={() => setSelected((current) => current.includes(symptom) ? current.filter((item) => item !== symptom) : [...current, symptom])} /><span>{ADDITIONAL_LABELS[symptom]}</span><Icon name="check" size={15} /></label>)}</fieldset><button className="button primary wide" type="submit" disabled={disabled}>Save and continue</button></form>;
}

export function ResultSummary({ result }: { result: NeutralPreTriageResult }) {
  return <section className="pretriage-result" aria-labelledby="result-title"><span className="pretriage-success-icon"><Icon name="check" size={23} /></span><p>Pre-Triage complete</p><h1 id="result-title">{result.primarySymptom.display}</h1><p className="result-completed">Completed {formatDate(result.completedAt)}</p><dl className="pretriage-summary"><SummaryItem label="Duration" value={`${result.duration.value} ${unitLabel(result.duration.unit, result.duration.value)}`} /><SummaryItem label="Intensity" value={`${result.intensity}`} /><SummaryItem label="Additional symptoms" value={result.additionalSymptoms.length ? result.additionalSymptoms.map((item) => ADDITIONAL_LABELS[item]).join(", ") : "None"} /></dl></section>;
}

function SummaryItem({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }

function PreTriageFrame({ backHref, children, subtitle, title }: { backHref: string; children: React.ReactNode; subtitle: string; title: string }) {
  return <FlowFrame className="phase4-pretriage-frame"><main className="flow-shell phase4-pretriage-shell"><header className="flow-header"><div className="flow-header-row"><Link href={backHref} className="icon-button" aria-label="Go back"><Icon name="arrow-left" size={18} /></Link><div><h1>{title}</h1><p>{subtitle}</p></div></div></header><div className="phase4-pretriage-body">{children}</div></main></FlowFrame>;
}

function PreTriageLoading({ label }: { label: string }) { return <FlowFrame className="phase4-pretriage-frame"><main className="flow-shell phase4-pretriage-shell"><div className="pretriage-loading" role="status"><span /><span /><span /><p>{label}</p></div></main></FlowFrame>; }
function UnavailableState({ error }: { error: unknown }) { return <section className="pretriage-panel claim-error"><span className="pretriage-feature-icon"><Icon name="info" size={22} /></span><h1>This Pre-Triage is unavailable</h1><p role="alert">{preTriageErrorMessage(error || new BeeexyApiError(404))}</p><Link className="button primary wide" href="/pre-triage/new">Start a new Pre-Triage</Link></section>; }
function useSessionId() { return useParams<{ sessionId: string }>().sessionId; }
function pathwayLabel(pathway: PreTriagePathway) { return SUPPORTED_PATHWAYS.find((item) => item.code === pathway)?.label || pathway; }
function unitLabel(unit: DurationUnit, value: number) { const label = unit.toLowerCase(); return value === 1 ? label.slice(0, -1) : label; }
function isAdditionalSymptom(value: string): value is AdditionalSymptom { return value === "NAUSEA" || value === "DIARRHEA" || value === "FEVER"; }
export function allowedAdditionalSymptoms(pathway: PreTriagePathway, allowedValues: string[]) { return allowedValues.filter(isAdditionalSymptom).filter((value) => !(pathway === "FEVER" && value === "FEVER")); }
export function questionForProgression(progression?: QuestionnaireProgress) { return progression ? progression.nextQuestion : INITIAL_DURATION_QUESTION; }
function resumePath(active: { sessionId: string; progression?: { readyToComplete: boolean }; result?: unknown; pendingClaim: boolean }) { const base = `/pre-triage/${encodeURIComponent(active.sessionId)}`; if (active.pendingClaim) return `${base}/claim`; if (active.result) return `${base}/result`; if (active.progression?.readyToComplete) return `${base}/review`; return base; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
