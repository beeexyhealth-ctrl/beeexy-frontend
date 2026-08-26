"use client";

import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Icon } from "@/components/ui/icon";
import type {
  DurationAnswer,
  PreTriageConversationProjection,
  PreTriagePathway,
} from "@/lib/beeexy-api/contracts";
import type { ChatIntakeState } from "./use-chat-intake";

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

type ChatPreTriageShellProps = {
  backHref: string;
  composerLoading?: boolean;
  contextControl?: ReactNode;
  entryState?: ChatIntakeState;
  error?: ChatShellError | null;
  initialComposerDisabled?: boolean;
  initialComposerHint?: string;
  loading?: boolean;
  onCandidateSelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  onComposerSubmit?: (value: string) => Promise<void> | void;
  onEntryReset?: () => void;
  onEntryRetry?: () => Promise<void> | void;
  onPathwaySelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  onRetry?: () => void;
  projection?: PreTriageConversationProjection | null;
  reviewHref?: string;
  resultHref?: string;
  startingPathway?: PreTriagePathway | null;
  transientUserTurn?: string;
};

export function ChatPreTriageShell({
  backHref,
  composerLoading = false,
  contextControl,
  entryState = { kind: "idle" },
  error,
  initialComposerDisabled = false,
  initialComposerHint,
  loading = false,
  onCandidateSelect,
  onComposerSubmit,
  onEntryReset,
  onEntryRetry,
  onPathwaySelect,
  onRetry,
  projection,
  reviewHref,
  resultHref,
  startingPathway = null,
  transientUserTurn,
}: ChatPreTriageShellProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<HTMLDivElement>(null);
  const previousInteractionRef = useRef<string | null>(null);
  const interactionCode = projection?.nextInteraction?.questionCode || projection?.state || null;

  useEffect(() => {
    const previous = previousInteractionRef.current;
    previousInteractionRef.current = interactionCode;
    if (!previous || !interactionCode || previous === interactionCode) return;
    const feed = feedRef.current;
    const interaction = interactionRef.current;
    if (!feed || !interaction || feed.scrollHeight - feed.scrollTop - feed.clientHeight > 180) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    interaction.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }, [interactionCode]);

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
            composerLoading={composerLoading}
            contextControl={contextControl}
            entryState={entryState}
            initialComposerDisabled={initialComposerDisabled}
            initialComposerHint={initialComposerHint}
            interactionRef={interactionRef}
            onCandidateSelect={onCandidateSelect}
            onComposerSubmit={onComposerSubmit}
            onEntryReset={onEntryReset}
            onEntryRetry={onEntryRetry}
            onPathwaySelect={onPathwaySelect}
            projection={projection}
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
  composerLoading,
  contextControl,
  entryState,
  initialComposerDisabled,
  initialComposerHint,
  interactionRef,
  onCandidateSelect,
  onComposerSubmit,
  onEntryReset,
  onEntryRetry,
  onPathwaySelect,
  projection,
  reviewHref,
  resultHref,
  startingPathway,
  transientUserTurn,
}: {
  composerLoading: boolean;
  contextControl?: ReactNode;
  entryState: ChatIntakeState;
  initialComposerDisabled: boolean;
  initialComposerHint?: string;
  interactionRef: React.RefObject<HTMLDivElement | null>;
  onCandidateSelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  onComposerSubmit?: (value: string) => Promise<void> | void;
  onEntryReset?: () => void;
  onEntryRetry?: () => Promise<void> | void;
  onPathwaySelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  projection?: PreTriageConversationProjection | null;
  reviewHref?: string;
  resultHref?: string;
  startingPathway: PreTriagePathway | null;
  transientUserTurn?: string;
}) {
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
      {!transientUserTurn && <AcceptedValueTurns projection={projection} />}

      <div ref={interactionRef}>
        {projection.state === "IN_PROGRESS" && projection.nextInteraction && (
          <AssistantMessage text={projection.nextInteraction.prompt}>
            <InteractionPanel label="Current response">
              <p className="chat-interaction-note">Share a short answer below.</p>
            </InteractionPanel>
          </AssistantMessage>
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

      {projection.state === "IN_PROGRESS" && (
        <ChatComposer disabled={!onComposerSubmit} loading={composerLoading} onSubmit={onComposerSubmit} />
      )}
    </div>
  );
}

function AcceptedValueTurns({ projection }: { projection: PreTriageConversationProjection }) {
  const { acceptedValues } = projection;
  return (
    <>
      {acceptedValues.duration && <UserMessage label="Duration" text={formatDuration(acceptedValues.duration)} />}
      {acceptedValues.intensity !== undefined && <UserMessage label="Intensity" text={`${acceptedValues.intensity} out of 10`} />}
      {acceptedValues.additionalSymptoms !== undefined && (
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
  loading = false,
  onSubmit,
}: {
  disabled?: boolean;
  hint?: string;
  loading?: boolean;
  onSubmit?: (value: string) => Promise<void> | void;
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
      <label className="sr-only" htmlFor={id}>Describe what you are experiencing</label>
      <textarea
        id={id}
        aria-describedby={hintId}
        disabled={disabled || loading}
        maxLength={4000}
        placeholder="Describe what you’re experiencing"
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
