"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FlowFrame } from "@/components/layout/flow-frame";
import { useAuth } from "@/features/auth/auth-provider";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";
import { usePreTriage } from "@/features/pre-triage/pre-triage-provider";
import type { PreTriagePathway } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";
import { ChatPreTriageShell, ConversationHeader, type ChatShellError } from "./chat-shell";

export function PreTriageChatStartScreen() {
  const router = useRouter();
  const { status: authStatus } = useAuth();
  const { activePatient, bootstrapStatus, patients, selectActivePatient } = usePatients();
  const { abandon, active, clearError, error, hydrated, operation, start } = usePreTriage();
  const [startingPathway, setStartingPathway] = useState<PreTriagePathway | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState(activePatient?.profileId || "");

  const mode = authStatus === "authenticated" ? "authenticated" : "anonymous";
  const resolvedPatientId = selectedPatientId || activePatient?.profileId || "";
  const selectedPatient = patients.find((patient) => patient.profileId === resolvedPatientId) || activePatient;
  const loading = !hydrated || authStatus === "bootstrapping" || (mode === "authenticated" && bootstrapStatus === "loading");

  async function choosePathway(pathway: PreTriagePathway) {
    if (operation || startingPathway) return;
    clearError();
    setStartingPathway(pathway);
    try {
      const session = await start(pathway, mode, selectedPatient);
      router.push(`/pre-triage/${encodeURIComponent(session.sessionId)}`);
    } catch {
      setStartingPathway(null);
    }
  }

  if (!loading && active?.mode === "anonymous" && active.sessionId) {
    const resumeHref = active.result
      ? `/pre-triage/${encodeURIComponent(active.sessionId)}/result`
      : active.conversation?.state === "READY_FOR_REVIEW" || active.progression?.readyToComplete
        ? `/pre-triage/${encodeURIComponent(active.sessionId)}/review`
        : `/pre-triage/${encodeURIComponent(active.sessionId)}`;
    return (
      <FlowFrame className="phase4-pretriage-frame">
        <main className="chat-pretriage-shell">
          <ConversationHeader backHref={mode === "anonymous" ? "/login" : "/home"} projection={active.conversation} />
          <section className="chat-resume-state" aria-labelledby="chat-resume-title">
            <h2 id="chat-resume-title">Your Pre-Triage is still available</h2>
            <p>Continue where you left off, or start a new conversation.</p>
            <Link className="button primary wide" href={resumeHref}>Continue Pre-Triage</Link>
            <button className="button secondary wide" type="button" onClick={abandon}>Start again</button>
          </section>
        </main>
      </FlowFrame>
    );
  }

  const contextControl = mode === "authenticated" && patients.length > 0 ? (
    <div className="chat-patient-context">
      <label htmlFor="chat-pretriage-patient">Who is this for?</label>
      <select
        id="chat-pretriage-patient"
        value={resolvedPatientId}
        onChange={(event) => {
          setSelectedPatientId(event.target.value);
          selectActivePatient(event.target.value);
        }}
      >
        {patients.map((patient) => (
          <option key={patient.profileId} value={patient.profileId}>
            {displayPatientName(patient)} ({patient.accessType === "Primary" ? "You" : "Managed profile"})
          </option>
        ))}
      </select>
    </div>
  ) : undefined;

  return (
    <FlowFrame className="phase4-pretriage-frame">
      <ChatPreTriageShell
        backHref={mode === "anonymous" ? "/login" : "/home"}
        contextControl={contextControl}
        error={error ? chatShellError(error) : null}
        loading={loading}
        onPathwaySelect={selectedPatient || mode === "anonymous" ? choosePathway : undefined}
        onRetry={() => {
          clearError();
          setStartingPathway(null);
        }}
        startingPathway={startingPathway}
      />
    </FlowFrame>
  );
}

export function PreTriageChatSessionScreen() {
  const sessionId = useParams<{ sessionId: string }>().sessionId;
  const { status: authStatus } = useAuth();
  const { active, error, hydrated, loadConversation, operation, submit } = usePreTriage();
  const requestedSessionRef = useRef<string | null>(null);
  const [bootstrapState, setBootstrapState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!hydrated || authStatus === "bootstrapping" || bootstrapState !== "loading" || requestedSessionRef.current === sessionId) return;
    requestedSessionRef.current = sessionId;
    setBootstrapState("loading");
    void loadConversation(sessionId)
      .then(() => setBootstrapState("ready"))
      .catch((caught) => {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setBootstrapState("error");
      });
  }, [authStatus, bootstrapState, hydrated, loadConversation, sessionId]);

  function retry() {
    requestedSessionRef.current = null;
    setBootstrapState("loading");
  }

  async function sendMessage(value: string) {
    await submit({ naturalLanguage: value });
  }

  const projection = active?.sessionId === sessionId ? active.conversation : null;
  const loading = !hydrated || authStatus === "bootstrapping" || bootstrapState === "loading" || (!projection && bootstrapState !== "error");
  const shellError = bootstrapState === "error" ? chatShellError(error) : null;

  return (
    <FlowFrame className="phase4-pretriage-frame">
      <ChatPreTriageShell
        backHref={authStatus === "authenticated" ? "/home" : "/login"}
        composerLoading={operation === "answering"}
        error={shellError}
        loading={loading}
        onComposerSubmit={projection?.state === "IN_PROGRESS" ? sendMessage : undefined}
        onRetry={shellError?.retryable ? retry : undefined}
        projection={projection}
        reviewHref={`/pre-triage/${encodeURIComponent(sessionId)}/review`}
        resultHref={`/pre-triage/${encodeURIComponent(sessionId)}/result`}
      />
    </FlowFrame>
  );
}

export function chatShellError(error: unknown): ChatShellError {
  if (error instanceof BeeexyNetworkError) {
    return {
      title: "We couldn’t load your conversation",
      message: "Check your connection and try again.",
      retryable: true,
    };
  }
  if (error instanceof BeeexyApiError) {
    if (error.status === 401) {
      return {
        title: "Access needs to be restored",
        message: "This Pre-Triage can’t be opened with the current session.",
        retryable: false,
      };
    }
    if (error.status === 404) {
      return {
        title: "This Pre-Triage is unavailable",
        message: "It may have expired or may no longer be accessible. You can start a new one.",
        retryable: false,
      };
    }
    if (error.status >= 500) {
      return {
        title: "Beeexy couldn’t load your conversation",
        message: "Your information hasn’t been changed. Try again in a moment.",
        retryable: true,
      };
    }
  }
  return {
    title: "Beeexy couldn’t load your conversation",
    message: "Please try again. If the problem continues, start a new Pre-Triage.",
    retryable: true,
  };
}
