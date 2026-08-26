"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConversationNextInteraction,
  PreTriageAnswerResponse,
  PreTriageConversationProjection,
  StructuredPreTriageAnswers,
  SubmitPreTriageAnswersRequest,
} from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export type ChatProgressionState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "recovering" }
  | { kind: "validation"; message: string }
  | { kind: "blocked"; message: string }
  | { kind: "retryable"; message: string }
  | { kind: "recovery-failed"; message: string };

type AnswerAttempt = {
  answer: StructuredPreTriageAnswers;
  identity: string;
  interaction: ConversationNextInteraction;
  sessionId: string;
};

type UseChatProgressionOptions = {
  projection?: PreTriageConversationProjection | null;
  recoverConversation: (sessionId: string, signal?: AbortSignal) => Promise<PreTriageConversationProjection>;
  submitAnswer: (request: SubmitPreTriageAnswersRequest, signal?: AbortSignal) => Promise<PreTriageAnswerResponse>;
};

export function conversationInteractionKey(projection?: PreTriageConversationProjection | null) {
  if (!projection?.nextInteraction || projection.state !== "IN_PROGRESS") return null;
  const interaction = projection.nextInteraction;
  return [
    projection.sessionId,
    projection.state,
    projection.questionnaire.version,
    interaction.questionCode,
    interaction.field,
    interaction.inputType,
  ].join("|");
}

export function useChatProgression({ projection, recoverConversation, submitAnswer }: UseChatProgressionOptions) {
  const [state, setState] = useState<ChatProgressionState>({ kind: "idle" });
  const projectionRef = useRef(projection);
  const inFlightRef = useRef(false);
  const attemptRef = useRef<AnswerAttempt | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const previousIdentityRef = useRef(conversationInteractionKey(projection));

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    projectionRef.current = projection;
  }, [projection]);

  useEffect(() => {
    const identity = conversationInteractionKey(projection);
    if (identity === previousIdentityRef.current) return;
    previousIdentityRef.current = identity;
    if (!inFlightRef.current) {
      attemptRef.current = null;
      setState({ kind: "idle" });
    }
  }, [projection]);

  const reconcile = useCallback(async (attempt: AnswerAttempt, allowExactRetry: boolean) => {
    setState({ kind: "recovering" });
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const canonical = await recoverConversation(attempt.sessionId, controller.signal);
      const canonicalIdentity = conversationInteractionKey(canonical);
      if (canonicalIdentity !== attempt.identity) {
        attemptRef.current = null;
        setState({ kind: "idle" });
        return;
      }
      if (allowExactRetry) {
        attemptRef.current = attempt;
        setState({
          kind: "retryable",
          message: "We confirmed this question still needs an answer. You can safely retry the same response.",
        });
      } else {
        attemptRef.current = null;
        setState({
          kind: "blocked",
          message: "The conversation changed while that response was being saved. Review the current question and answer again.",
        });
      }
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      attemptRef.current = attempt;
      setState({
        kind: "recovery-failed",
        message: "We couldn't confirm whether that response was saved. Check the conversation before trying the answer again.",
      });
    } finally {
      controllerRef.current = null;
    }
  }, [recoverConversation]);

  const execute = useCallback(async (attempt: AnswerAttempt) => {
    if (inFlightRef.current) return;
    const current = projectionRef.current;
    if (!current || conversationInteractionKey(current) !== attempt.identity) {
      setState({ kind: "blocked", message: "That question is no longer current. Continue with the response shown now." });
      return;
    }

    inFlightRef.current = true;
    attemptRef.current = attempt;
    setState({ kind: "submitting" });
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await submitAnswer({ structured: attempt.answer }, controller.signal);
      attemptRef.current = null;
      setState({ kind: "idle" });
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      if (caught instanceof BeeexyApiError && (caught.status === 400 || caught.status === 422)) {
        attemptRef.current = null;
        setState({ kind: "validation", message: validationMessage(caught.problem?.errorCode) });
      } else if (caught instanceof BeeexyApiError && (caught.status === 401 || caught.status === 404)) {
        attemptRef.current = null;
        setState({
          kind: "blocked",
          message: caught.status === 401
            ? "This response couldn't be saved with the current access. Reopen the Pre-Triage to continue."
            : "This Pre-Triage is no longer available.",
        });
      } else if (caught instanceof BeeexyNetworkError || (caught instanceof BeeexyApiError && caught.status >= 500)) {
        await reconcile(attempt, true);
      } else if (caught instanceof BeeexyApiError && caught.status === 409) {
        await reconcile(attempt, false);
      } else {
        attemptRef.current = null;
        setState({ kind: "blocked", message: "That response couldn't be saved. Review it and try again." });
      }
    } finally {
      controllerRef.current = null;
      inFlightRef.current = false;
    }
  }, [reconcile, submitAnswer]);

  const submit = useCallback(async (
    interaction: ConversationNextInteraction,
    answer: StructuredPreTriageAnswers,
  ) => {
    const current = projectionRef.current;
    const identity = conversationInteractionKey(current);
    if (!current || !identity || current.nextInteraction !== interaction) {
      setState({ kind: "blocked", message: "That question is no longer current. Continue with the response shown now." });
      return;
    }
    await execute({ answer, identity, interaction, sessionId: current.sessionId });
  }, [execute]);

  const retryAnswer = useCallback(async () => {
    const attempt = attemptRef.current;
    if (!attempt || state.kind !== "retryable") return;
    await execute(attempt);
  }, [execute, state.kind]);

  const retryRecovery = useCallback(async () => {
    const attempt = attemptRef.current;
    if (!attempt || state.kind !== "recovery-failed" || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await reconcile(attempt, true);
    } finally {
      inFlightRef.current = false;
    }
  }, [reconcile, state.kind]);

  return { retryAnswer, retryRecovery, state, submit };
}

function validationMessage(errorCode?: string) {
  if (errorCode?.includes("duration")) return "Enter a duration that matches the available limits and units.";
  if (errorCode?.includes("intensity")) return "Choose a value within the scale shown.";
  if (errorCode?.includes("additional") || errorCode?.includes("symptom")) return "Review the selected symptoms and try again.";
  return "Review this response and try again.";
}
