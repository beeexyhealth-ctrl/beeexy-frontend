"use client";

import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "@/components/ui/icon";
import type {
  ConversationQuestionInteraction,
  DurationAnswer,
  EducationalVideoDecision,
  EducationalVideoOfferInteraction,
  PreTriageConversationProjection,
  PreTriagePathway,
  RequiredAnswerCode,
  StructuredPreTriageAnswers,
} from "@/lib/beeexy-api/contracts";
import type { EducationalVideoPresentation } from "@/features/pre-triage/pre-triage-provider";
import { ConversationInteraction } from "./conversation-interaction";
import type { ChatIntakeState } from "./use-chat-intake";
import { conversationInteractionKey, type ChatProgressionState } from "./use-chat-progression";

export const CHAT_PATHWAYS: ReadonlyArray<{ code: PreTriagePathway; label: string }> = [
  { code: "HEADACHE", label: "Headache" },
  { code: "ABDOMINAL_PAIN", label: "Stomach pain" },
  { code: "CHEST_PAIN", label: "Chest pain" },
  { code: "FEVER", label: "Fever" },
  { code: "OTHER_SYMPTOMS", label: "Other" },
];

export interface ChatShellError {
  title: string;
  message: string;
  retryable: boolean;
}

export const EDUCATIONAL_VIDEO_REVEAL_DELAY_MS = 1_500;

type VisualTranscriptExchange = {
  answeredField: RequiredAnswerCode;
  assistantPrompt: string;
  id: string;
  userAnswer: string;
};

type VisualTranscriptState = {
  exchanges: VisualTranscriptExchange[];
  sessionId: string;
};

type ChatPreTriageShellProps = {
  backHref: string;
  contextControl?: ReactNode;
  entryState?: ChatIntakeState;
  error?: ChatShellError | null;
  initialComposerDisabled?: boolean;
  initialComposerHint?: string;
  educationalVideoPresentation?: EducationalVideoPresentation;
  loading?: boolean;
  onCandidateSelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  onComposerSubmit?: (value: string) => Promise<void> | void;
  onEntryReset?: () => void;
  onEntryRetry?: () => Promise<void> | void;
  onPathwaySelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  onProgressionRecoveryRetry?: () => Promise<void> | void;
  onProgressionRetry?: () => Promise<void> | void;
  onRetry?: () => void;
  onStructuredSubmit?: (interaction: ConversationQuestionInteraction, answer: StructuredPreTriageAnswers) => Promise<void> | void;
  onVideoDecision?: (interaction: EducationalVideoOfferInteraction, decision: EducationalVideoDecision) => Promise<void> | void;
  progressionState?: ChatProgressionState;
  projection?: PreTriageConversationProjection | null;
  reviewHref?: string;
  resultHref?: string;
  startingPathway?: PreTriagePathway | null;
  transientUserTurn?: string;
};

export function ChatPreTriageShell({
  backHref,
  contextControl,
  entryState = { kind: "idle" },
  error,
  initialComposerDisabled = false,
  initialComposerHint,
  educationalVideoPresentation,
  loading = false,
  onCandidateSelect,
  onComposerSubmit,
  onEntryReset,
  onEntryRetry,
  onPathwaySelect,
  onProgressionRecoveryRetry,
  onProgressionRetry,
  onRetry,
  onStructuredSubmit,
  onVideoDecision,
  projection,
  progressionState = { kind: "idle" },
  reviewHref,
  resultHref,
  startingPathway = null,
  transientUserTurn,
}: ChatPreTriageShellProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<HTMLDivElement>(null);
  const previousInteractionRef = useRef<string | null>(null);
  const interactionIdentity = conversationInteractionKey(projection)
    || (projection ? `${projection.sessionId}|${projection.state}` : null);

  useEffect(() => {
    const previous = previousInteractionRef.current;
    previousInteractionRef.current = interactionIdentity;
    if (!previous || !interactionIdentity || previous === interactionIdentity) return;
    const feed = feedRef.current;
    const interaction = interactionRef.current;
    if (!feed || !interaction || feed.scrollHeight - feed.scrollTop - feed.clientHeight > 180) return;
    const reduceMotion = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    interaction.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }, [interactionIdentity]);

  return (
    <main className="chat-pretriage-shell" aria-busy={loading || undefined}>
      <ConversationHeader backHref={backHref} projection={projection} />
      <div className="chat-conversation-feed" ref={feedRef} aria-label="Pre-Triage conversation">
        {loading ? (
          <ConversationLoading />
        ) : error ? (
          <ConversationError error={error} onRetry={onRetry} />
        ) : (
          <ConversationContent
            key={projection?.sessionId || "entry"}
            contextControl={contextControl}
            entryState={entryState}
            initialComposerDisabled={initialComposerDisabled}
            initialComposerHint={initialComposerHint}
            educationalVideoPresentation={educationalVideoPresentation}
            interactionRef={interactionRef}
            onCandidateSelect={onCandidateSelect}
            onComposerSubmit={onComposerSubmit}
            onEntryReset={onEntryReset}
            onEntryRetry={onEntryRetry}
            onPathwaySelect={onPathwaySelect}
            onProgressionRecoveryRetry={onProgressionRecoveryRetry}
            onProgressionRetry={onProgressionRetry}
            onStructuredSubmit={onStructuredSubmit}
            onVideoDecision={onVideoDecision}
            projection={projection}
            progressionState={progressionState}
            reviewHref={reviewHref}
            resultHref={resultHref}
            startingPathway={startingPathway}
            transientUserTurn={transientUserTurn}
          />
        )}
      </div>
    </main>
  );
}

export function ConversationHeader({
  backHref,
  projection,
}: {
  backHref: string;
  projection?: PreTriageConversationProjection | null;
}) {
  const percentage = projection?.progress.percentage;
  return (
    <header className="chat-conversation-header">
      <div className="chat-header-row">
        <Link href={backHref} className="icon-button" aria-label="Go back">
          <Icon name="arrow-left" size={18} />
        </Link>
        <span className="chat-assistant-mark" aria-hidden="true"><Icon name="activity" size={17} /></span>
        <div className="chat-header-copy">
          <h1>Beeexy Pre-Triage</h1>
          <p>{projection ? projection.pathway.label : "Neutral symptom intake"}</p>
        </div>
        {percentage !== undefined && <strong className="chat-progress-value">{percentage}%</strong>}
      </div>
      {percentage !== undefined && (
        <div
          className="chat-progress-track"
          role="progressbar"
          aria-label="Pre-Triage completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
        >
          <span style={{ width: `${percentage}%` }} />
        </div>
      )}
    </header>
  );
}

function ConversationContent({
  contextControl,
  educationalVideoPresentation,
  entryState,
  initialComposerDisabled,
  initialComposerHint,
  interactionRef,
  onCandidateSelect,
  onComposerSubmit,
  onEntryReset,
  onEntryRetry,
  onPathwaySelect,
  onProgressionRecoveryRetry,
  onProgressionRetry,
  onStructuredSubmit,
  onVideoDecision,
  projection,
  progressionState,
  reviewHref,
  resultHref,
  startingPathway,
  transientUserTurn,
}: {
  contextControl?: ReactNode;
  educationalVideoPresentation?: EducationalVideoPresentation;
  entryState: ChatIntakeState;
  initialComposerDisabled: boolean;
  initialComposerHint?: string;
  interactionRef: React.RefObject<HTMLDivElement | null>;
  onCandidateSelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  onComposerSubmit?: (value: string) => Promise<void> | void;
  onEntryReset?: () => void;
  onEntryRetry?: () => Promise<void> | void;
  onPathwaySelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  onProgressionRecoveryRetry?: () => Promise<void> | void;
  onProgressionRetry?: () => Promise<void> | void;
  onStructuredSubmit?: (interaction: ConversationQuestionInteraction, answer: StructuredPreTriageAnswers) => Promise<void> | void;
  onVideoDecision?: (interaction: EducationalVideoOfferInteraction, decision: EducationalVideoDecision) => Promise<void> | void;
  projection?: PreTriageConversationProjection | null;
  progressionState: ChatProgressionState;
  reviewHref?: string;
  resultHref?: string;
  startingPathway: PreTriagePathway | null;
  transientUserTurn?: string;
}) {
  const [visualTranscript, setVisualTranscript] = useState<VisualTranscriptState>(() => ({
    exchanges: [],
    sessionId: projection?.sessionId || "",
  }));
  const previousProjectionRef = useRef(projection);
  const videoPresentationId = educationalVideoPresentation?.decision === "WATCH"
    ? `${projection?.sessionId}|${educationalVideoPresentation.interaction.video.id}|WATCH`
    : null;
  const [revealedVideoPresentationId, setRevealedVideoPresentationId] = useState<string | null>(null);

  useEffect(() => {
    if (!videoPresentationId) return;
    const timeout = window.setTimeout(() => {
      setRevealedVideoPresentationId(videoPresentationId);
    }, EDUCATIONAL_VIDEO_REVEAL_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [videoPresentationId]);

  useLayoutEffect(() => {
    const previousProjection = previousProjectionRef.current;
    previousProjectionRef.current = projection;
    setVisualTranscript((current) => advanceVisualTranscript(current, previousProjection, projection));
  }, [projection]);

  function submitStructured(interaction: ConversationQuestionInteraction, answer: StructuredPreTriageAnswers) {
    return onStructuredSubmit?.(interaction, answer);
  }

  const revealClinicalInteraction = !videoPresentationId
    || revealedVideoPresentationId === videoPresentationId;

  if (!projection) {
    const entryPending = entryState.kind === "pending" || entryState.kind === "resolved";
    const selectedPathway = startingPathway ? CHAT_PATHWAYS.find((pathway) => pathway.code === startingPathway) : null;
    const entryText = entryState.kind === "idle" ? null : entryState.text;
    const composerBlocked = initialComposerDisabled || entryPending || Boolean(startingPathway)
      || entryState.kind === "conflict" || entryState.kind === "rejected";
    return (
      <div className="chat-feed-content">
        {contextControl}
        <AssistantMessage text="Hi! What are you experiencing today?">
          <InteractionPanel label="Choose a symptom">
            <QuickReplies disabled={entryPending || Boolean(startingPathway)} loadingPathway={startingPathway} onSelect={onPathwaySelect} />
          </InteractionPanel>
        </AssistantMessage>
        {entryText && <UserMessage text={entryText} />}
        {selectedPathway && entryText !== selectedPathway.label && <UserMessage text={selectedPathway.label} />}
        <EntryFeedback
          state={entryState}
          startingPathway={startingPathway}
          onCandidateSelect={onCandidateSelect}
          onReset={onEntryReset}
          onRetry={onEntryRetry}
        />
        <ChatComposer
          disabled={composerBlocked || !onComposerSubmit}
          hint={initialComposerHint}
          loading={entryPending}
          onSubmit={onComposerSubmit}
        />
      </div>
    );
  }

  return (
    <div className="chat-feed-content">
      <AssistantMessage text="I’ll help organize the details you share." />
      <UserMessage text={transientUserTurn || projection.pathway.label} />
      <ConversationAcceptedValueTurns
        key={projection.sessionId}
        answeredFields={visualTranscript.exchanges.map((exchange) => exchange.answeredField)}
        projection={projection}
        transientUserTurn={transientUserTurn}
      />
      {educationalVideoPresentation && (
        <EducationalVideoTranscript presentation={educationalVideoPresentation} />
      )}
      {visualTranscript.exchanges.map((exchange) => (
        <div key={exchange.id}>
          <AssistantMessage text={exchange.assistantPrompt} />
          <UserMessage text={exchange.userAnswer} />
        </div>
      ))}

      <div ref={interactionRef} aria-live="polite">
        {projection.state === "IN_PROGRESS"
          && projection.nextInteraction?.type === "EDUCATIONAL_VIDEO_OFFER" && (
          <AssistantMessage text={projection.nextInteraction.prompt}>
            <InteractionPanel label="Educational video choice">
              <EducationalVideoOfferControl
                disabled={progressionState.kind === "submitting"
                  || progressionState.kind === "recovering"
                  || progressionState.kind === "recovery-failed"}
                error={progressionState.kind === "validation" || progressionState.kind === "blocked"
                  ? progressionState.message
                  : null}
                interaction={projection.nextInteraction}
                onSubmit={onVideoDecision}
              />
              <ProgressionFeedback
                state={progressionState}
                onRecoveryRetry={onProgressionRecoveryRetry}
                onRetry={onProgressionRetry}
              />
            </InteractionPanel>
          </AssistantMessage>
        )}

        {projection.state === "IN_PROGRESS"
          && projection.nextInteraction?.type === "QUESTION"
          && revealClinicalInteraction && (
          <AssistantMessage text={projection.nextInteraction.prompt}>
            <InteractionPanel label="Current response">
              <ConversationInteraction
                key={conversationInteractionKey(projection)}
                disabled={progressionState.kind === "submitting"
                  || progressionState.kind === "recovering"
                  || progressionState.kind === "recovery-failed"}
                error={progressionState.kind === "validation" || progressionState.kind === "blocked"
                  ? progressionState.message
                  : null}
                interaction={projection.nextInteraction}
                onSubmit={submitStructured}
                pending={progressionState.kind === "submitting" || progressionState.kind === "recovering"}
              />
              <ProgressionFeedback
                state={progressionState}
                onRecoveryRetry={onProgressionRecoveryRetry}
                onRetry={onProgressionRetry}
              />
            </InteractionPanel>
          </AssistantMessage>
        )}

        {projection.state === "IN_PROGRESS"
          && projection.nextInteraction?.type === "QUESTION"
          && !revealClinicalInteraction && (
          <p className="chat-processing chat-video-next-status" role="status">Preparing the next question</p>
        )}

        {projection.state === "READY_FOR_REVIEW" && (
          <AssistantMessage text="Your information is ready to review.">
            <InteractionPanel label="Review Pre-Triage">
              {reviewHref && <Link className="button primary wide" href={reviewHref}>Review details</Link>}
            </InteractionPanel>
          </AssistantMessage>
        )}

        {projection.state === "COMPLETED" && (
          <AssistantMessage text="Your Pre-Triage is complete.">
            <InteractionPanel label="Completed Pre-Triage">
              {resultHref && <Link className="button primary wide" href={resultHref}>View summary</Link>}
            </InteractionPanel>
          </AssistantMessage>
        )}
      </div>
    </div>
  );
}

function ConversationAcceptedValueTurns({
  answeredFields,
  projection,
  transientUserTurn,
}: {
  answeredFields: ReadonlyArray<RequiredAnswerCode>;
  projection: PreTriageConversationProjection;
  transientUserTurn?: string;
}) {
  const [intakeFields] = useState<ReadonlyArray<RequiredAnswerCode>>(() => {
    if (!transientUserTurn) return [];
    const accepted = projection.acceptedValues;
    return [
      ...(accepted.duration ? ["DURATION" as const] : []),
      ...(accepted.intensity !== undefined ? ["INTENSITY" as const] : []),
      ...(accepted.additionalSymptoms !== undefined ? ["ADDITIONAL_SYMPTOMS" as const] : []),
    ];
  });
  return (
    <AcceptedValueTurns
      hiddenFields={[...intakeFields, ...answeredFields]}
      projection={projection}
    />
  );
}

function AcceptedValueTurns({
  hiddenFields,
  projection,
}: {
  hiddenFields: ReadonlyArray<RequiredAnswerCode>;
  projection: PreTriageConversationProjection;
}) {
  const { acceptedValues } = projection;
  return (
    <>
      {acceptedValues.duration && !hiddenFields.includes("DURATION") && <UserMessage label="Duration" text={formatDuration(acceptedValues.duration)} />}
      {acceptedValues.intensity !== undefined && !hiddenFields.includes("INTENSITY") && <UserMessage label="Intensity" text={`${acceptedValues.intensity}`} />}
      {acceptedValues.additionalSymptoms !== undefined && !hiddenFields.includes("ADDITIONAL_SYMPTOMS") && (
        <UserMessage
          label="Additional symptoms"
          text={acceptedValues.additionalSymptoms.length
            ? acceptedValues.additionalSymptoms.map(humanizeCode).join(", ")
            : "None"}
        />
      )}
    </>
  );
}

function advanceVisualTranscript(
  current: VisualTranscriptState,
  previousProjection?: PreTriageConversationProjection | null,
  projection?: PreTriageConversationProjection | null,
): VisualTranscriptState {
  if (!projection) return current;
  if (current.sessionId !== projection.sessionId) {
    return { exchanges: [], sessionId: projection.sessionId };
  }
  if (!previousProjection || previousProjection.sessionId !== projection.sessionId) return current;

  const previousIdentity = conversationInteractionKey(previousProjection);
  if (!previousIdentity || previousIdentity === conversationInteractionKey(projection)) return current;
  if (current.exchanges.some((exchange) => exchange.id === previousIdentity)) return current;

  const interaction = previousProjection.nextInteraction;
  if (!interaction || interaction.type !== "QUESTION") return current;
  const userAnswer = formatAcceptedInteractionAnswer(interaction, projection);
  if (userAnswer === null) return current;

  return {
    ...current,
    exchanges: [
      ...current.exchanges,
      {
        answeredField: interaction.questionCode,
        assistantPrompt: interaction.prompt,
        id: previousIdentity,
        userAnswer,
      },
    ],
  };
}

function formatAcceptedInteractionAnswer(
  interaction: ConversationQuestionInteraction,
  projection: PreTriageConversationProjection,
) {
  if (interaction.inputType === "DURATION") {
    return projection.acceptedValues.duration
      ? formatDuration(projection.acceptedValues.duration)
      : null;
  }
  if (interaction.inputType === "SCALE") {
    return projection.acceptedValues.intensity !== undefined
      ? `${projection.acceptedValues.intensity}`
      : null;
  }
  if (projection.acceptedValues.additionalSymptoms === undefined) return null;
  if (projection.acceptedValues.additionalSymptoms.length === 0) return "None";
  const labels = new Map(interaction.options.map((option) => [option.value, option.label]));
  return projection.acceptedValues.additionalSymptoms
    .map((value) => labels.get(value) || humanizeCode(value))
    .join(", ");
}

function EducationalVideoOfferControl({
  disabled,
  error,
  interaction,
  onSubmit,
}: {
  disabled: boolean;
  error?: string | null;
  interaction: EducationalVideoOfferInteraction;
  onSubmit?: (interaction: EducationalVideoOfferInteraction, decision: EducationalVideoDecision) => Promise<void> | void;
}) {
  const selectingRef = useRef(false);

  async function choose(decision: EducationalVideoDecision) {
    if (disabled || selectingRef.current || !onSubmit) return;
    selectingRef.current = true;
    try {
      await onSubmit(interaction, decision);
    } finally {
      selectingRef.current = false;
    }
  }

  return (
    <div className="chat-video-offer-control">
      <div className="chat-video-offer-actions">
        {interaction.options.map((option) => (
          <button
            className={`button wide chat-video-offer-button ${option.value === "WATCH" ? "primary" : "secondary"}`}
            disabled={disabled || !onSubmit}
            key={option.value}
            type="button"
            onClick={() => void choose(option.value)}
          >
            {option.value === "WATCH" && <Icon name="video" size={18} />}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      {error && <p className="chat-control-error" role="alert">{error}</p>}
    </div>
  );
}

function EducationalVideoTranscript({ presentation }: { presentation: EducationalVideoPresentation }) {
  return (
    <>
      <AssistantMessage text={presentation.interaction.prompt} />
      <UserMessage text={presentation.optionLabel} />
      {presentation.decision === "WATCH" && (
        <article className="chat-turn assistant chat-video-turn" aria-label="Beeexy educational video">
          <span className="chat-message-avatar" aria-hidden="true"><Icon name="video" size={15} /></span>
          <div className="chat-message-column">
            <p className="chat-speaker">Beeexy</p>
            <div className="chat-video-card">
              <div className="chat-video-heading">
                <span aria-hidden="true"><Icon name="video" size={17} /></span>
                <div>
                  <p>Educational video</p>
                  <h2>{presentation.interaction.video.title}</h2>
                </div>
              </div>
              <video controls preload="metadata" playsInline aria-label={presentation.interaction.video.title}>
                <source src={presentation.interaction.video.url} type="video/mp4" />
                Your browser does not support HTML5 video.
              </video>
            </div>
          </div>
        </article>
      )}
    </>
  );
}

function ProgressionFeedback({
  onRecoveryRetry,
  onRetry,
  state,
}: {
  onRecoveryRetry?: () => Promise<void> | void;
  onRetry?: () => Promise<void> | void;
  state: ChatProgressionState;
}) {
  if (state.kind === "submitting") {
    return <p className="chat-processing" role="status">Saving your response</p>;
  }
  if (state.kind === "recovering") {
    return <p className="chat-processing" role="status">Checking whether your response was saved</p>;
  }
  if (state.kind === "retryable") {
    return (
      <div className="chat-progression-feedback" role="status">
        <p>{state.message}</p>
        <button className="button secondary wide" type="button" onClick={() => void onRetry?.()}>Retry answer</button>
      </div>
    );
  }
  if (state.kind === "recovery-failed") {
    return (
      <div className="chat-progression-feedback" role="alert">
        <p>{state.message}</p>
        <button className="button secondary wide" type="button" onClick={() => void onRecoveryRetry?.()}>Check conversation</button>
      </div>
    );
  }
  return null;
}

export function AssistantMessage({ children, text }: { children?: ReactNode; text: string }) {
  return (
    <article className="chat-turn assistant" aria-label="Beeexy">
      <span className="chat-message-avatar" aria-hidden="true"><Icon name="activity" size={15} /></span>
      <div className="chat-message-column">
        <p className="chat-speaker">Beeexy</p>
        <div className="chat-message-bubble"><p>{text}</p></div>
        {children}
      </div>
    </article>
  );
}

export function UserMessage({ label, text }: { label?: string; text: string }) {
  return (
    <article className="chat-turn user" aria-label="You">
      <div className="chat-message-column">
        <p className="chat-speaker">{label || "You"}</p>
        <div className="chat-message-bubble"><p>{text}</p></div>
      </div>
    </article>
  );
}

export function InteractionPanel({ children, label }: { children: ReactNode; label: string }) {
  return <section className="chat-interaction-panel" aria-label={label}>{children}</section>;
}

export function QuickReplies({
  disabled = false,
  loadingPathway = null,
  onSelect,
  pathways = CHAT_PATHWAYS,
}: {
  disabled?: boolean;
  loadingPathway?: PreTriagePathway | null;
  onSelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  pathways?: ReadonlyArray<{ code: PreTriagePathway; label: string }>;
}) {
  const selectingRef = useRef(false);

  async function select(pathway: PreTriagePathway) {
    if (selectingRef.current || disabled || !onSelect) return;
    selectingRef.current = true;
    try {
      await onSelect(pathway);
    } finally {
      selectingRef.current = false;
    }
  }

  return (
    <div className={`chat-quick-replies${pathways.length === CHAT_PATHWAYS.length ? "" : " compact"}`}>
      {pathways.map((pathway) => (
        <button
          type="button"
          className="chat-quick-reply"
          disabled={disabled || !onSelect}
          key={pathway.code}
          onClick={() => void select(pathway.code)}
        >
          <span>{loadingPathway === pathway.code ? "Starting..." : pathway.label}</span>
          <Icon name="chevron-right" size={15} />
        </button>
      ))}
    </div>
  );
}

export function ChatComposer({
  disabled = false,
  hint,
  label = "Describe what you are experiencing",
  loading = false,
  maxLength = 4000,
  onSubmit,
  placeholder = "Describe what you’re experiencing",
}: {
  disabled?: boolean;
  hint?: string;
  label?: string;
  loading?: boolean;
  maxLength?: number;
  onSubmit?: (value: string) => Promise<void> | void;
  placeholder?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [value, setValue] = useState("");
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function submitValue() {
    const normalized = value.trim();
    if (!normalized || disabled || loading || !onSubmit || submittingRef.current) return;
    submittingRef.current = true;
    try {
      await onSubmit(normalized);
      setValue("");
      if (textareaRef.current) textareaRef.current.style.height = "";
    } catch {
      // The provider keeps the safe error state and the composer retains the text for retry.
    } finally {
      submittingRef.current = false;
    }
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitValue();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submitValue();
  }

  return (
    <form className="chat-composer" onSubmit={submitForm} aria-label="Message Beeexy">
      <label className="sr-only" htmlFor={id}>{label}</label>
      <textarea
        id={id}
        aria-describedby={hintId}
        disabled={disabled || loading}
        maxLength={maxLength}
        placeholder={placeholder}
        rows={1}
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          event.target.style.height = "auto";
          event.target.style.height = `${Math.min(event.target.scrollHeight, 112)}px`;
        }}
        onKeyDown={handleKeyDown}
      />
      <button
        type="submit"
        className="chat-send-button"
        aria-label={loading ? "Sending message" : "Send message"}
        disabled={disabled || loading || !value.trim() || !onSubmit}
      >
        <Icon name="send" size={17} />
      </button>
      <p id={hintId}>{hint || (disabled ? "Choose a symptom to begin." : "Press Enter to send. Shift + Enter adds a new line.")}</p>
      {loading && <span className="sr-only" role="status">Sending your message</span>}
    </form>
  );
}

function EntryFeedback({
  onCandidateSelect,
  onReset,
  onRetry,
  startingPathway,
  state,
}: {
  onCandidateSelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  onReset?: () => void;
  onRetry?: () => Promise<void> | void;
  startingPathway: PreTriagePathway | null;
  state: ChatIntakeState;
}) {
  if (startingPathway || state.kind === "pending" || state.kind === "resolved") {
    return (
      <AssistantMessage text="I'm organizing what you shared.">
        <p className="chat-processing" role="status">Processing your response</p>
      </AssistantMessage>
    );
  }
  if (state.kind === "ambiguous") {
    const candidates = state.candidates.flatMap((code) => {
      const pathway = CHAT_PATHWAYS.find((candidate) => candidate.code === code);
      return pathway ? [pathway] : [];
    });
    return (
      <AssistantMessage text="I found more than one possible symptom category. Which one best matches what you mean?">
        {candidates.length > 0 && (
          <InteractionPanel label="Clarify the symptom">
            <QuickReplies pathways={candidates} onSelect={onCandidateSelect} />
          </InteractionPanel>
        )}
      </AssistantMessage>
    );
  }
  if (state.kind === "unresolved") {
    return <AssistantMessage text="I couldn't match that clearly. Describe the main symptom another way, or choose one of the supported symptoms above." />;
  }
  if (state.kind === "retryable") {
    const message = state.reason === "unavailable"
      ? "I can't interpret that description right now. You can retry it or choose a supported symptom above."
      : "I couldn't confirm that response. Retry the same description, or choose a supported symptom above.";
    return (
      <AssistantMessage text={message}>
        <InteractionPanel label="Retry symptom description">
          <button className="button secondary wide" type="button" onClick={() => void onRetry?.()}>Retry description</button>
        </InteractionPanel>
      </AssistantMessage>
    );
  }
  if (state.kind === "conflict") {
    const message = state.reason === "anonymous-replay"
      ? "The earlier request may have completed, but it can't be safely recovered here. Start a new description or choose a supported symptom."
      : "That request couldn't be safely continued. Start a new description or choose a supported symptom.";
    return (
      <AssistantMessage text={message}>
        <InteractionPanel label="Start a new description">
          <button className="button secondary wide" type="button" onClick={onReset}>Start a new description</button>
        </InteractionPanel>
      </AssistantMessage>
    );
  }
  if (state.kind === "rejected") {
    return (
      <AssistantMessage text="I couldn't use that description. Start a new description or choose a supported symptom above.">
        <InteractionPanel label="Try another description">
          <button className="button secondary wide" type="button" onClick={onReset}>Try another description</button>
        </InteractionPanel>
      </AssistantMessage>
    );
  }
  return null;
}

export function ConversationLoading() {
  return (
    <div className="chat-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading your Pre-Triage conversation</span>
      <div className="chat-skeleton avatar" />
      <div className="chat-skeleton-lines"><div /><div /></div>
      <div className="chat-skeleton-lines short"><div /><div /></div>
    </div>
  );
}

export function ConversationError({ error, onRetry }: { error: ChatShellError; onRetry?: () => void }) {
  return (
    <section className="chat-error-state" aria-labelledby="chat-error-title">
      <span className="chat-error-icon" aria-hidden="true"><Icon name="info" size={21} /></span>
      <h2 id="chat-error-title">{error.title}</h2>
      <p role="alert">{error.message}</p>
      {error.retryable && onRetry ? (
        <button className="button primary wide" type="button" onClick={onRetry}>Try again</button>
      ) : (
        <Link className="button primary wide" href="/pre-triage/new">Start a new Pre-Triage</Link>
      )}
    </section>
  );
}

function formatDuration(duration: DurationAnswer) {
  const plural = duration.unit.toLowerCase();
  const unit = duration.value === 1 ? plural.slice(0, -1) : plural;
  return `${duration.value} ${unit}`;
}

function humanizeCode(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
