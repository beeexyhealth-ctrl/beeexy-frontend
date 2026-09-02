"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { ChatComposer } from "@/features/pre-triage-chat/chat-shell";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";
import type {
  AiConversationDetail as AiConversationDetailContract,
  AiConversationMessage as AiConversationMessageContract,
  AiConversationExecution,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { AiConversationDeleteDialog } from "./ai-conversation-delete-dialog";
import {
  aiConversationLoadErrorMessage,
  aiConversationSendError,
  formatAiConversationDate,
} from "./ai-conversation-state";

export function AiConversationDetail({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { activePatient, patients } = usePatients();
  const [detail, setDetail] = useState<AiConversationDetailContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const readControllerRef = useRef<AbortController | null>(null);
  const sendControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const sendingRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const hasInitiallyScrolledRef = useRef(false);
  const scrollAfterSendRef = useRef(false);

  const loadDetail = useCallback(async ({ preserve = false, afterSend = false, reset = false } = {}) => {
    readControllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    readControllerRef.current = controller;
    await Promise.resolve();
    if (controller.signal.aborted || requestId !== requestIdRef.current) return false;
    if (reset) {
      setDetail(null);
      setUnavailable(false);
      setSendError(null);
      setSendNotice(null);
      setLimitReached(false);
      hasInitiallyScrolledRef.current = false;
    }
    if (preserve) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    try {
      const response = await beeexyPhase10Api.getAiConversation(conversationId, controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return false;
      if (afterSend) scrollAfterSendRef.current = true;
      setDetail(response);
      setUnavailable(false);
      return true;
    } catch (caught) {
      if (controller.signal.aborted || requestId !== requestIdRef.current
        || (caught instanceof Error && caught.name === "AbortError")) return false;
      if (caught instanceof BeeexyApiError && caught.status === 404) {
        setDetail(null);
        setUnavailable(true);
        return false;
      }
      setLoadError(aiConversationLoadErrorMessage(caught));
      return false;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      if (readControllerRef.current === controller) readControllerRef.current = null;
    }
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadDetail({ reset: true });
    });
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
      readControllerRef.current?.abort();
      sendControllerRef.current?.abort();
      sendingRef.current = false;
    };
  }, [conversationId, loadDetail]);

  useEffect(() => {
    if (!detail) return;
    const behavior = hasInitiallyScrolledRef.current && scrollAfterSendRef.current ? "smooth" : "auto";
    if (!hasInitiallyScrolledRef.current || scrollAfterSendRef.current) {
      messageEndRef.current?.scrollIntoView?.({ behavior, block: "end" });
      hasInitiallyScrolledRef.current = true;
      scrollAfterSendRef.current = false;
    }
  }, [detail]);

  async function sendMessage(content: string) {
    if (sendingRef.current || !detail || limitReached) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    setSendNotice(null);
    const controller = new AbortController();
    sendControllerRef.current = controller;
    const finishSending = () => {
      if (sendControllerRef.current === controller) sendControllerRef.current = null;
      sendingRef.current = false;
      setSending(false);
    };

    let execution: AiConversationExecution;
    try {
      execution = await beeexyPhase10Api.sendAiConversationMessage(
        conversationId,
        { content },
        controller.signal,
      );
    } catch (caught) {
      finishSending();
      if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
      const mapped = aiConversationSendError(caught);
      setSendError(mapped.message);
      if (mapped.limitReached) setLimitReached(true);
      if (caught instanceof BeeexyApiError && caught.status === 404) setUnavailable(true);
      throw caught;
    }

    if (controller.signal.aborted) {
      finishSending();
      return;
    }
    if (execution.status === "failed") {
      setSendNotice("Beeexy couldn’t prepare an AI response. Your submitted message remains in the conversation.");
    } else if (execution.status === "rejected") {
      setSendNotice("Beeexy couldn’t add an AI response. Your submitted message remains in the conversation.");
    }

    const refreshed = await loadDetail({ preserve: true, afterSend: true });
    if (!refreshed && !controller.signal.aborted) {
      setSendError("Your message was accepted, but the conversation could not refresh. Reload history to see the latest messages.");
    }
    finishSending();
  }

  const associatedPatient = detail?.conversation.patientId
    ? patients.find((patient) => patient.profileId === detail.conversation.patientId)
    : null;
  const contextMismatch = Boolean(
    detail?.conversation.patientId
    && activePatient?.profileId !== detail.conversation.patientId,
  );

  if (loading && !detail) return <AiConversationDetailSkeleton />;

  if (unavailable) {
    return (
      <div className="page ai-conversation-detail-page">
        <Link className="back-link" href="/ai/conversations"><Icon name="arrow-left" size={16} />AI History</Link>
        <section className="ai-conversation-state" aria-labelledby="ai-conversation-unavailable-title">
          <span aria-hidden="true"><Icon name="info" size={22} /></span>
          <h1 id="ai-conversation-unavailable-title">Conversation unavailable</h1>
          <p role="alert">This conversation is unavailable. It may have been removed or your access may have changed.</p>
          <Link className="button primary" href="/ai/conversations">Return to AI History</Link>
        </section>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="page ai-conversation-detail-page">
        <Link className="back-link" href="/ai/conversations"><Icon name="arrow-left" size={16} />AI History</Link>
        <section className="ai-conversation-state" aria-labelledby="ai-conversation-load-error-title">
          <span aria-hidden="true"><Icon name="info" size={22} /></span>
          <h1 id="ai-conversation-load-error-title">Conversation didn’t load</h1>
          <p role="alert">{loadError}</p>
          <button className="button primary" onClick={() => void loadDetail()} type="button">Try again</button>
        </section>
      </div>
    );
  }

  const associationLabel = detail.conversation.patientId === null
    ? "General · no patient association"
    : associatedPatient
      ? `About ${displayPatientName(associatedPatient)}`
      : "Patient-associated conversation";

  return (
    <div className="page ai-conversation-detail-page">
      <Link className="back-link" href="/ai/conversations"><Icon name="arrow-left" size={16} />AI History</Link>
      <header className="ai-conversation-detail-header">
        <div className="ai-conversation-detail-title">
          <span aria-hidden="true"><Icon name="sparkles" size={19} /></span>
          <div>
            <p className="eyebrow">Beeexy AI</p>
            <h1>AI Conversation</h1>
            <p>{associationLabel} · Started {formatAiConversationDate(detail.conversation.createdAt)}</p>
          </div>
        </div>
        <div className="ai-conversation-detail-actions">
          <button
            aria-label="Refresh conversation"
            className="icon-button"
            disabled={refreshing || sending}
            onClick={() => void loadDetail({ preserve: true })}
            type="button"
          >
            <Icon name="history" size={17} />
          </button>
          <button
            aria-label="Remove conversation from AI History"
            className="icon-button ai-conversation-detail-remove"
            disabled={sending}
            onClick={() => setDeleteOpen(true)}
            type="button"
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      </header>

      {refreshing && <p className="ai-conversation-refreshing" role="status">Refreshing conversation…</p>}
      {loadError && detail && (
        <div className="ai-conversation-inline-error" role="alert">
          <Icon name="info" size={16} />
          <p>{loadError}</p>
          <button className="text-button" onClick={() => void loadDetail({ preserve: true })} type="button">Retry</button>
        </div>
      )}

      {contextMismatch ? (
        <section className="ai-conversation-context-guard" aria-labelledby="ai-conversation-context-title">
          <span aria-hidden="true"><Icon name="users" size={22} /></span>
          <h2 id="ai-conversation-context-title">Switch back to this conversation’s patient</h2>
          <p>This patient-associated conversation is hidden while another profile is active. Its association has not changed.</p>
          <Link className="button secondary" href="/ai/conversations">Return to AI History</Link>
        </section>
      ) : (
        <>
          <section className="ai-conversation-transcript" aria-labelledby="ai-conversation-messages-title">
            <h2 className="sr-only" id="ai-conversation-messages-title">Conversation messages</h2>
            {detail.messages.length === 0 ? (
              <div className="ai-conversation-no-messages">
                <span aria-hidden="true"><Icon name="message" size={22} /></span>
                <h2>Ask your first question</h2>
                <p>Beeexy can explain general health information, medical terms, or help you prepare questions for a doctor.</p>
              </div>
            ) : (
              <ol className="ai-conversation-messages" aria-label="Conversation messages">
                {detail.messages.map((message) => (
                  <AiConversationMessage key={message.messageId} message={message} />
                ))}
              </ol>
            )}
            <div ref={messageEndRef} />
          </section>

          {sendNotice && <div className="ai-conversation-send-notice" role="status"><Icon name="info" size={16} /><p>{sendNotice}</p></div>}
          {sendError && <div className="ai-conversation-inline-error" role="alert"><Icon name="info" size={16} /><p>{sendError}</p></div>}
          {limitReached && (
            <div className="ai-conversation-limit" role="status">
              <Icon name="info" size={16} />
              <p>This conversation remains available to read. Start a new conversation to continue.</p>
              <Link href="/ai/conversations" className="text-button">Open AI History</Link>
            </div>
          )}

          <aside
            className="ai-conversation-disclaimer"
            data-disclaimer-version={detail.disclaimer.version}
            aria-label="AI disclaimer"
          >
            <Icon name="shield" size={15} />
            <p>{detail.disclaimer.content}</p>
          </aside>

          <div className="ai-conversation-composer-wrap" aria-busy={sending}>
            <ChatComposer
              disabled={limitReached}
              hint={limitReached
                ? "This conversation has reached its message limit."
                : "Press Enter to send. Shift + Enter adds a new line."}
              label="Message Beeexy AI"
              loading={sending}
              maxLength={4000}
              onSubmit={sendMessage}
              placeholder="Ask a general health question"
            />
          </div>
        </>
      )}

      {deleteOpen && (
        <AiConversationDeleteDialog
          conversationId={conversationId}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => router.replace("/ai/conversations")}
        />
      )}
    </div>
  );
}

export function AiConversationMessage({ message }: { message: AiConversationMessageContract }) {
  if (message.role !== "user" && message.role !== "assistant") {
    return (
      <li className="ai-conversation-unsupported-message" role="status">
        <Icon name="info" size={16} />
        <p>This message type can’t be displayed.</p>
      </li>
    );
  }

  const assistant = message.role === "assistant";
  return (
    <li>
      <article
        className={`chat-turn ${assistant ? "assistant" : "user"} ai-conversation-message`}
        aria-label={assistant ? "Message from Beeexy AI" : "Message from you"}
      >
        {assistant && (
          <span className="chat-message-avatar" aria-hidden="true"><Icon name="sparkles" size={15} /></span>
        )}
        <div className="chat-message-column">
          <p className="chat-speaker">{assistant ? "Beeexy AI" : "You"}</p>
          <div className="chat-message-bubble"><p>{message.content}</p></div>
          <time dateTime={message.createdAt}>{formatAiConversationDate(message.createdAt)}</time>
        </div>
      </article>
    </li>
  );
}

function AiConversationDetailSkeleton() {
  return (
    <div className="page ai-conversation-detail-page" role="status" aria-label="Loading AI Conversation">
      <span className="sr-only">Loading AI Conversation</span>
      <div className="ai-conversation-detail-skeleton-header" />
      <div className="ai-conversation-detail-skeleton-message" />
      <div className="ai-conversation-detail-skeleton-message user" />
      <div className="ai-conversation-detail-skeleton-composer" />
    </div>
  );
}
