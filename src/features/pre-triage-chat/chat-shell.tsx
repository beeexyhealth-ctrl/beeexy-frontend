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
  error?: ChatShellError | null;
  loading?: boolean;
  onComposerSubmit?: (value: string) => Promise<void> | void;
  onPathwaySelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  onRetry?: () => void;
  projection?: PreTriageConversationProjection | null;
  reviewHref?: string;
  resultHref?: string;
  startingPathway?: PreTriagePathway | null;
};

export function ChatPreTriageShell({
  backHref,
  composerLoading = false,
  contextControl,
  error,
  loading = false,
  onComposerSubmit,
  onPathwaySelect,
  onRetry,
  projection,
  reviewHref,
  resultHref,
  startingPathway = null,
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
            interactionRef={interactionRef}
            onComposerSubmit={onComposerSubmit}
            onPathwaySelect={onPathwaySelect}
            projection={projection}
            reviewHref={reviewHref}
            resultHref={resultHref}
            startingPathway={startingPathway}
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
  interactionRef,
  onComposerSubmit,
  onPathwaySelect,
  projection,
  reviewHref,
  resultHref,
  startingPathway,
}: {
  composerLoading: boolean;
  contextControl?: ReactNode;
  interactionRef: React.RefObject<HTMLDivElement | null>;
  onComposerSubmit?: (value: string) => Promise<void> | void;
  onPathwaySelect?: (pathway: PreTriagePathway) => Promise<void> | void;
  projection?: PreTriageConversationProjection | null;
  reviewHref?: string;
  resultHref?: string;
  startingPathway: PreTriagePathway | null;
}) {
  if (!projection) {
    return (
      <div className="chat-feed-content">
        {contextControl}
        <AssistantMessage text="Hi! What are you experiencing today?">
          <InteractionPanel label="Choose a symptom">
            <QuickReplies disabled={Boolean(startingPathway)} loadingPathway={startingPathway} onSelect={onPathwaySelect} />
          </InteractionPanel>
        </AssistantMessage>
        <ChatComposer disabled loading={false} />
      </div>
    );
  }

  return (
    <div className="chat-feed-content">
      <AssistantMessage text="I’ll help organize the details you share." />
      <UserMessage text={projection.pathway.label} />
      <AcceptedValueTurns projection={projection} />

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
}: {
  disabled?: boolean;
  loadingPathway?: PreTriagePathway | null;
  onSelect?: (pathway: PreTriagePathway) => Promise<void> | void;
}) {
  return (
    <div className="chat-quick-replies">
      {CHAT_PATHWAYS.map((pathway) => (
        <button
          type="button"
          className="chat-quick-reply"
          disabled={disabled || !onSelect}
          key={pathway.code}
          onClick={() => void onSelect?.(pathway.code)}
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
  loading = false,
  onSubmit,
}: {
  disabled?: boolean;
  loading?: boolean;
  onSubmit?: (value: string) => Promise<void> | void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [value, setValue] = useState("");
  const submittingRef = useRef(false);

  async function submitValue() {
    const normalized = value.trim();
    if (!normalized || disabled || loading || !onSubmit || submittingRef.current) return;
    submittingRef.current = true;
    try {
      await onSubmit(normalized);
      setValue("");
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
        value={value}
        onChange={(event) => setValue(event.target.value)}
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
      <p id={hintId}>{disabled ? "Choose a symptom to begin." : "Press Enter to send. Shift + Enter adds a new line."}</p>
      {loading && <span className="sr-only" role="status">Sending your message</span>}
    </form>
  );
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
