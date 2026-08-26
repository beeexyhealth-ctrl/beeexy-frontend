"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NeutralPreTriageResult, PreTriageConversationProjection } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export type ChatCompletionState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "recovering" }
  | { kind: "retryable"; message: string }
  | { kind: "recovery-failed"; message: string }
  | { kind: "validation"; message: string }
  | { kind: "blocked"; message: string }
  | { kind: "completed" };

type RecoveryReason = "uncertain" | "conflict" | "validation";

type CompletionAttempt = {
  identity: string;
  reason: RecoveryReason;
  sessionId: string;
};

type UseChatCompletionOptions = {
  completeSession: (signal?: AbortSignal) => Promise<NeutralPreTriageResult>;
  projection?: PreTriageConversationProjection | null;
  recoverConversation: (sessionId: string, signal?: AbortSignal) => Promise<PreTriageConversationProjection>;
};

export function completionProjectionKey(projection?: PreTriageConversationProjection | null) {
  if (!projection) return null;
  return [projection.sessionId, projection.state, projection.questionnaire.version].join("|");
}

export function useChatCompletion({ completeSession, projection, recoverConversation }: UseChatCompletionOptions) {
  const [state, setState] = useState<ChatCompletionState>({ kind: "idle" });
  const projectionRef = useRef(projection);
  const inFlightRef = useRef(false);
  const attemptRef = useRef<CompletionAttempt | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    projectionRef.current = projection;
  }, [projection]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const reconcile = useCallback(async (attempt: CompletionAttempt) => {
    setState({ kind: "recovering" });
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const canonical = await recoverConversation(attempt.sessionId, controller.signal);
      if (canonical.state === "COMPLETED") {
        attemptRef.current = null;
        setState({ kind: "completed" });
        return;
      }
      if (canonical.state === "READY_FOR_REVIEW" && completionProjectionKey(canonical) === attempt.identity) {
        if (attempt.reason === "validation") {
          attemptRef.current = null;
          setState({ kind: "validation", message: "Beeexy couldn't complete this Pre-Triage. Review the information and try again." });
        } else {
          attemptRef.current = attempt;
          setState({
            kind: "retryable",
            message: "We confirmed this Pre-Triage is still ready. You can safely retry completion.",
          });
        }
        return;
      }
      attemptRef.current = null;
      setState({ kind: "idle" });
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      attemptRef.current = attempt;
      setState({
        kind: "recovery-failed",
        message: "We couldn't confirm whether completion succeeded. Check its status before trying again.",
      });
    } finally {
      controllerRef.current = null;
    }
  }, [recoverConversation]);

  const execute = useCallback(async () => {
    if (inFlightRef.current) return;
    const current = projectionRef.current;
    if (!current || current.state !== "READY_FOR_REVIEW" || current.nextInteraction) {
      setState({ kind: "blocked", message: "This Pre-Triage is not currently ready to complete." });
      return;
    }

    const baseAttempt: CompletionAttempt = {
      identity: completionProjectionKey(current)!,
      reason: "uncertain",
      sessionId: current.sessionId,
    };
    inFlightRef.current = true;
    setState({ kind: "submitting" });
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await completeSession(controller.signal);
      attemptRef.current = null;
      setState({ kind: "completed" });
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      if (caught instanceof BeeexyApiError && (caught.status === 401 || caught.status === 404)) {
        attemptRef.current = null;
        setState({
          kind: "blocked",
          message: caught.status === 401
            ? "Access to this Pre-Triage needs to be restored before it can be completed."
            : "This Pre-Triage is no longer available.",
        });
      } else if (caught instanceof BeeexyNetworkError || (caught instanceof BeeexyApiError && caught.status >= 500)) {
        await reconcile(baseAttempt);
      } else if (caught instanceof BeeexyApiError && caught.status === 409) {
        await reconcile({ ...baseAttempt, reason: "conflict" });
      } else if (caught instanceof BeeexyApiError && (caught.status === 400 || caught.status === 422)) {
        await reconcile({ ...baseAttempt, reason: "validation" });
      } else {
        attemptRef.current = null;
        setState({ kind: "blocked", message: "Beeexy couldn't complete this Pre-Triage. Please try again later." });
      }
    } finally {
      controllerRef.current = null;
      inFlightRef.current = false;
    }
  }, [completeSession, reconcile]);

  const retryCompletion = useCallback(async () => {
    if (state.kind !== "retryable") return;
    const attempt = attemptRef.current;
    if (!attempt || completionProjectionKey(projectionRef.current) !== attempt.identity) {
      setState({ kind: "blocked", message: "This Pre-Triage changed. Continue from its current state." });
      return;
    }
    await execute();
  }, [execute, state.kind]);

  const retryRecovery = useCallback(async () => {
    if (state.kind !== "recovery-failed" || inFlightRef.current) return;
    const attempt = attemptRef.current;
    if (!attempt) return;
    inFlightRef.current = true;
    try {
      await reconcile(attempt);
    } finally {
      inFlightRef.current = false;
    }
  }, [reconcile, state.kind]);

  return { complete: execute, retryCompletion, retryRecovery, state };
}
