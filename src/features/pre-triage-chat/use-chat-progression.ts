"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConversationQuestionInteraction,
  EducationalVideoDecision,
  EducationalVideoOfferInteraction,
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
  kind: "answer";
  answer: StructuredPreTriageAnswers;
  identity: string;
  interaction: ConversationQuestionInteraction;
  sessionId: string;
};

type VideoOfferAttempt = {
  kind: "video-offer";
  decision: EducationalVideoDecision;
  identity: string;
  interaction: EducationalVideoOfferInteraction;
  sessionId: string;
};

type ProgressionAttempt = AnswerAttempt | VideoOfferAttempt;

type UseChatProgressionOptions = {
  projection?: PreTriageConversationProjection | null;
  recoverConversation: (sessionId: string, signal?: AbortSignal) => Promise<PreTriageConversationProjection>;
  resolveVideoOffer?: (decision: EducationalVideoDecision, signal?: AbortSignal) => Promise<unknown>;
  submitAnswer: (request: SubmitPreTriageAnswersRequest, signal?: AbortSignal) => Promise<PreTriageAnswerResponse>;
};

export function conversationInteractionKey(projection?: PreTriageConversationProjection | null) {
  if (!projection?.nextInteraction || projection.state !== "IN_PROGRESS") return null;
  const interaction = projection.nextInteraction;
  return [
    projection.sessionId,
    projection.state,
    projection.questionnaire.version,
    interaction.type,
    interaction.field,
    interaction.inputType,
    ...(interaction.type === "QUESTION" ? [interaction.questionCode] : []),
  ].join("|");
}

export function useChatProgression({ projection, recoverConversation, resolveVideoOffer, submitAnswer }: UseChatProgressionOptions) {
  const [state, setState] = useState<ChatProgressionState>({ kind: "idle" });
  const projectionRef = useRef(projection);
  const inFlightRef = useRef(false);
  const attemptRef = useRef<ProgressionAttempt | null>(null);
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

  const reconcile = useCallback(async (attempt: ProgressionAttempt, allowExactRetry: boolean) => {
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
          message: "We confirmed this response is still needed. You can safely retry the same choice.",
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

  const execute = useCallback(async (attempt: ProgressionAttempt) => {
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
      if (attempt.kind === "answer") {
        await submitAnswer({ structured: attempt.answer }, controller.signal);
      } else {
        if (!resolveVideoOffer) throw new BeeexyApiError(500);
        await resolveVideoOffer(attempt.decision, controller.signal);
      }
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
  }, [reconcile, resolveVideoOffer, submitAnswer]);

  const submit = useCallback(async (
    interaction: ConversationQuestionInteraction,
    answer: StructuredPreTriageAnswers,
  ) => {
    const current = projectionRef.current;
    const identity = conversationInteractionKey(current);
    if (!current || !identity || current.nextInteraction !== interaction) {
      setState({ kind: "blocked", message: "That question is no longer current. Continue with the response shown now." });
      return;
    }
    await execute({ kind: "answer", answer, identity, interaction, sessionId: current.sessionId });
  }, [execute]);

  const submitVideoDecision = useCallback(async (
    interaction: EducationalVideoOfferInteraction,
    decision: EducationalVideoDecision,
  ) => {
    const current = projectionRef.current;
    const identity = conversationInteractionKey(current);
    if (!current || !identity || current.nextInteraction !== interaction) {
      setState({ kind: "blocked", message: "That offer is no longer current. Continue with the response shown now." });
      return;
    }
    if (!interaction.options.some((option) => option.value === decision)) {
      setState({ kind: "validation", message: "Choose one of the video options shown." });
      return;
    }
    await execute({ kind: "video-offer", decision, identity, interaction, sessionId: current.sessionId });
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

  return { retryAnswer, retryRecovery, state, submit, submitVideoDecision };
}

function validationMessage(errorCode?: string) {
  if (errorCode?.includes("duration")) return "Enter a duration that matches the available limits and units.";
  if (errorCode?.includes("intensity")) return "Choose a value within the scale shown.";
  if (errorCode?.includes("additional") || errorCode?.includes("symptom")) return "Review the selected symptoms and try again.";
  return "Review this response and try again.";
}
