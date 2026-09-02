"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Icon } from "@/components/ui/icon";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";
import type {
  AiConversationPurpose,
  AiConversationSummary,
  AccessiblePatient,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import { AiConversationDeleteDialog } from "./ai-conversation-delete-dialog";
import {
  aiConversationCreateErrorMessage,
  aiConversationLoadErrorMessage,
  formatAiConversationDate,
  mergeAiConversationPages,
} from "./ai-conversation-state";

const PURPOSE_OPTIONS: ReadonlyArray<{
  value: AiConversationPurpose;
  label: string;
  description: string;
}> = [
  {
    value: "GENERAL_HEALTH",
    label: "General health",
    description: "Ask an informational health question.",
  },
  {
    value: "MEDICAL_TERMS",
    label: "Understand medical terms",
    description: "Get plain-language context for terminology.",
  },
  {
    value: "SYMPTOM_DISCUSSION",
    label: "Discuss symptoms",
    description: "Organize what you want to discuss with a professional.",
  },
  {
    value: "CLINICIAN_QUESTIONS",
    label: "Prepare clinician questions",
    description: "Draft questions for your next visit.",
  },
];

type HistoryStatus = "loading" | "ready" | "error";

export function AiConversationHistory() {
  const [items, setItems] = useState<AiConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<HistoryStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const hiddenIdsRef = useRef(new Set<string>());

  const loadInitial = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    await Promise.resolve();
    if (controller.signal.aborted) return;
    setStatus("loading");
    setError(null);
    setPaginationError(null);

    try {
      const page = await beeexyPhase10Api.listAiConversations({}, controller.signal);
      if (controller.signal.aborted) return;
      setItems(page.items.filter((item) => !hiddenIdsRef.current.has(item.conversationId)));
      setNextCursor(page.nextCursor);
      setStatus("ready");
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
      setError(aiConversationLoadErrorMessage(caught));
      setStatus("error");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadInitial();
    });
    return () => {
      cancelled = true;
      controllerRef.current?.abort();
    };
  }, [loadInitial]);

  async function loadMore() {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setPaginationError(null);
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const page = await beeexyPhase10Api.listAiConversations(
        { cursor: nextCursor },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setItems((current) => mergeAiConversationPages(
        current,
        page.items,
        hiddenIdsRef.current,
      ));
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
      setPaginationError("We couldn’t load more conversations. Restart history to refresh the cursor.");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  function handleDeleted(conversationId: string, outcome: "removed" | "unavailable") {
    hiddenIdsRef.current.add(conversationId);
    setItems((current) => current.filter((item) => item.conversationId !== conversationId));
    setDeleteId(null);
    setNotice(outcome === "removed"
      ? "Conversation removed from AI History."
      : "That conversation is no longer available and was removed from this view.");
  }

  return (
    <div className="page ai-conversation-history-page">
      <header className="page-header ai-conversation-page-header">
        <div>
          <p className="eyebrow">AI History</p>
          <h1>AI Conversations</h1>
          <p>Informational conversations saved to your Beeexy account.</p>
        </div>
        <button className="button primary" onClick={() => setCreateOpen(true)} type="button">
          <Icon name="plus" size={16} />
          Start
        </button>
      </header>

      <aside className="ai-conversation-boundary-note" aria-label="AI conversation guidance">
        <Icon name="shield" size={17} />
        <p>Beeexy AI provides educational information and does not replace medical evaluation.</p>
      </aside>

      {notice && (
        <div className="ai-conversation-notice" role="status" tabIndex={-1}>
          <Icon name="check" size={16} />
          <p>{notice}</p>
        </div>
      )}

      {status === "loading" && <AiConversationListSkeleton />}

      {status === "error" && (
        <section className="ai-conversation-state" aria-labelledby="ai-history-error-title">
          <span aria-hidden="true"><Icon name="info" size={22} /></span>
          <h2 id="ai-history-error-title">History is unavailable</h2>
          <p role="alert">{error}</p>
          <button className="button primary" onClick={() => void loadInitial()} type="button">
            Try again
          </button>
        </section>
      )}

      {status === "ready" && items.length === 0 && (
        <section className="ai-conversation-empty" aria-labelledby="ai-history-empty-title">
          <span aria-hidden="true"><Icon name="message" size={24} /></span>
          <p className="eyebrow">A private place to ask</p>
          <h2 id="ai-history-empty-title">You haven’t started a conversation yet.</h2>
          <p>Ask general health questions, understand medical terms, or prepare questions for your doctor.</p>
          <div className="ai-conversation-empty-actions">
            <button className="button primary" onClick={() => setCreateOpen(true)} type="button">
              Start a conversation
            </button>
            <button className="text-button" onClick={() => void loadInitial()} type="button">
              Refresh
            </button>
          </div>
        </section>
      )}

      {status === "ready" && items.length > 0 && (
        <section aria-labelledby="ai-history-list-title">
          <div className="ai-conversation-list-heading">
            <div>
              <p className="eyebrow">Saved conversations</p>
              <h2 id="ai-history-list-title">Your recent history</h2>
            </div>
            <button className="text-button" onClick={() => void loadInitial()} type="button">
              Refresh
            </button>
          </div>
          <ul className="ai-conversation-list" aria-label="AI Conversation history">
            {items.map((conversation) => (
              <AiConversationListItem
                conversation={conversation}
                key={conversation.conversationId}
                onDelete={() => setDeleteId(conversation.conversationId)}
              />
            ))}
          </ul>
          {paginationError && (
            <div className="ai-conversation-pagination-error" role="alert">
              <p>{paginationError}</p>
              <button className="button secondary" onClick={() => void loadInitial()} type="button">
                Restart history
              </button>
            </div>
          )}
          {nextCursor && !paginationError && (
            <button
              aria-busy={loadingMore}
              className="button secondary wide ai-conversation-load-more"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              type="button"
            >
              {loadingMore ? "Loading…" : "Load more conversations"}
            </button>
          )}
        </section>
      )}

      {createOpen && <CreateAiConversationDialog onClose={() => setCreateOpen(false)} />}
      {deleteId && (
        <AiConversationDeleteDialog
          conversationId={deleteId}
          onClose={() => setDeleteId(null)}
          onDeleted={(outcome) => handleDeleted(deleteId, outcome)}
        />
      )}
    </div>
  );
}

export function AiConversationListItem({
  conversation,
  onDelete,
}: {
  conversation: AiConversationSummary;
  onDelete: () => void;
}) {
  const formattedDate = formatAiConversationDate(conversation.createdAt);
  const association = conversation.patientId === null
    ? "General · no patient association"
    : "Patient-associated conversation";

  return (
    <li className="ai-conversation-list-item">
      <Link
        aria-label={`Open conversation started ${formattedDate}`}
        className="ai-conversation-list-link"
        href={`/ai/conversations/${encodeURIComponent(conversation.conversationId)}`}
      >
        <span className="ai-conversation-list-icon" aria-hidden="true">
          <Icon name="message" size={18} />
        </span>
        <span className="ai-conversation-list-copy">
          <strong>{association}</strong>
          <time dateTime={conversation.createdAt}>Started {formattedDate}</time>
        </span>
        <Icon name="chevron-right" size={16} />
      </Link>
      <button
        aria-label={`Remove conversation started ${formattedDate} from history`}
        className="icon-button ai-conversation-remove-button"
        onClick={onDelete}
        type="button"
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  );
}

function CreateAiConversationDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { bootstrapStatus, patients } = usePatients();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const [purpose, setPurpose] = useState<AiConversationPurpose>("GENERAL_HEALTH");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      controllerRef.current?.abort();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const effectivePatientId = selectedPatientId
    && patients.some((patient) => patient.profileId === selectedPatientId)
    ? selectedPatientId
    : "";

  async function createConversation() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const created = await beeexyPhase10Api.createAiConversation(
        effectivePatientId ? { purpose, patientId: effectivePatientId } : { purpose },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        router.push(`/ai/conversations/${encodeURIComponent(created.conversationId)}`);
      }
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
      setError(aiConversationCreateErrorMessage(caught));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      pendingRef.current = false;
      setPending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !pending) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
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
      className="patient-dialog-backdrop ai-conversation-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section
        aria-busy={pending}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="patient-dialog ai-conversation-dialog ai-conversation-create-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <span className="ai-conversation-dialog-icon" aria-hidden="true">
          <Icon name="sparkles" size={22} />
        </span>
        <p className="eyebrow">New AI conversation</p>
        <h2 id={titleId}>Choose a starting point</h2>
        <p id={descriptionId}>The conversation topic and patient association cannot be changed later.</p>

        <fieldset className="ai-conversation-option-group">
          <legend>What would you like help with?</legend>
          {PURPOSE_OPTIONS.map((option) => (
            <RadioOption
              checked={purpose === option.value}
              description={option.description}
              disabled={pending}
              key={option.value}
              label={option.label}
              name="conversation-purpose"
              onChange={() => setPurpose(option.value)}
              value={option.value}
            />
          ))}
        </fieldset>

        <fieldset className="ai-conversation-option-group">
          <legend>Who is this conversation about?</legend>
          <RadioOption
            checked={effectivePatientId === ""}
            description="Keep this as a general conversation without patient context."
            disabled={pending}
            label="General · no patient"
            name="conversation-patient"
            onChange={() => setSelectedPatientId("")}
            value="general"
          />
          {patients.map((patient) => (
            <PatientRadioOption
              checked={effectivePatientId === patient.profileId}
              disabled={pending}
              key={patient.profileId}
              onChange={() => setSelectedPatientId(patient.profileId)}
              patient={patient}
            />
          ))}
          {bootstrapStatus === "loading" && (
            <p className="ai-conversation-patient-loading" role="status">Loading available patient profiles…</p>
          )}
        </fieldset>

        {error && (
          <div className="ai-conversation-dialog-error" role="alert">
            <Icon name="info" size={16} />
            <p>{error}</p>
          </div>
        )}
        <div className="ai-conversation-dialog-actions">
          <button
            className="button secondary"
            disabled={pending}
            onClick={onClose}
            ref={cancelRef}
            type="button"
          >
            Cancel
          </button>
          <button
            aria-busy={pending}
            className="button primary"
            disabled={pending}
            onClick={() => void createConversation()}
            type="button"
          >
            {pending ? "Starting…" : "Start conversation"}
          </button>
        </div>
      </section>
    </div>
  );
}

function RadioOption({
  checked,
  description,
  disabled,
  label,
  name,
  onChange,
  value,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  name: string;
  onChange: () => void;
  value: string;
}) {
  return (
    <label className="ai-conversation-radio-option">
      <input
        checked={checked}
        disabled={disabled}
        name={name}
        onChange={onChange}
        type="radio"
        value={value}
      />
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

function PatientRadioOption({
  checked,
  disabled,
  onChange,
  patient,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  patient: AccessiblePatient;
}) {
  const relationship = patient.accessType === "Primary" ? "You" : "Managed profile";
  return (
    <RadioOption
      checked={checked}
      description={relationship}
      disabled={disabled}
      label={displayPatientName(patient)}
      name="conversation-patient"
      onChange={onChange}
      value={patient.profileId}
    />
  );
}

function AiConversationListSkeleton() {
  return (
    <div className="ai-conversation-list-skeleton" role="status" aria-label="Loading AI Conversation history">
      <span className="sr-only">Loading AI Conversation history</span>
      <div /><div /><div />
    </div>
  );
}
