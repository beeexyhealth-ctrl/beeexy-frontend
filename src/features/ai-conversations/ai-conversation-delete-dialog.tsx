"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { aiConversationDeleteErrorMessage } from "./ai-conversation-state";

export function AiConversationDeleteDialog({
  conversationId,
  onClose,
  onDeleted,
}: {
  conversationId: string;
  onClose: () => void;
  onDeleted: (outcome: "removed" | "unavailable") => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    keepRef.current?.focus();
    return () => {
      controllerRef.current?.abort();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  async function remove() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      await beeexyPhase10Api.deleteAiConversation(conversationId, controller.signal);
      if (!controller.signal.aborted) onDeleted("removed");
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
      if (caught instanceof BeeexyApiError && caught.status === 404) {
        onDeleted("unavailable");
        return;
      }
      setError(aiConversationDeleteErrorMessage(caught));
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
        className="patient-dialog ai-conversation-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <span className="ai-conversation-dialog-icon danger" aria-hidden="true">
          <Icon name="history" size={22} />
        </span>
        <p className="eyebrow">AI History</p>
        <h2 id={titleId}>Remove this conversation?</h2>
        <p id={descriptionId}>
          You won’t see it in your normal AI Conversation history after removing it.
        </p>
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
            ref={keepRef}
            type="button"
          >
            Keep conversation
          </button>
          <button
            aria-busy={pending}
            className="button danger"
            disabled={pending}
            onClick={() => void remove()}
            type="button"
          >
            {pending ? "Removing…" : "Remove from history"}
          </button>
        </div>
      </section>
    </div>
  );
}
