"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { notifyClinicalHistoryChanged } from "@/features/clinical-history/clinical-history-refresh";
import { usePatients } from "@/features/my-circle/patient-provider";
import type {
  AccessiblePatient,
  ClaimAnonymousPreTriageResponse,
  ConversationNextInteraction,
  NeutralPreTriageResult,
  PreTriageAnswerResponse,
  PreTriageConversationProjection,
  PreTriagePathway,
  QuestionnaireProgress,
  StructuredPreTriageAnswers,
  StartPreTriageFromIntakeResponse,
  SubmitPreTriageAnswersRequest,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase4Api, type PreTriageAccess } from "@/lib/beeexy-api/phase-4-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";
import {
  clearAnonymousPreTriage,
  readAnonymousPreTriage,
  writeAnonymousPreTriage,
  type StoredAnonymousPreTriage,
} from "./pre-triage-storage";

export type PreTriageMode = "anonymous" | "authenticated";
export type PreTriageOperation = "starting" | "intaking" | "answering" | "completing" | "loading-conversation" | "loading-result" | "claiming" | null;

export interface ActivePreTriage {
  sessionId: string;
  mode: PreTriageMode;
  pathway: PreTriagePathway;
  patientId?: string;
  questionnaireVersion: string;
  expiresAt: string;
  progression?: QuestionnaireProgress;
  conversation?: PreTriageConversationProjection;
  acceptedAnswers: StructuredPreTriageAnswers;
  result?: NeutralPreTriageResult;
  pendingClaim: boolean;
  lastAnswerResponse?: PreTriageAnswerResponse;
  /** In-memory only; never written to anonymous flow storage. */
  transientUserTurn?: string;
}

type ActivePreTriageInternal = ActivePreTriage & { anonymousCapability?: string };

type PreTriageContextValue = {
  active: ActivePreTriage | null;
  error: unknown;
  hydrated: boolean;
  operation: PreTriageOperation;
  claimConfirmation: ClaimAnonymousPreTriageResponse | null;
  claimRecovered: boolean;
  pendingClaimRoute: string | null;
  abandon(): void;
  claim(): Promise<ClaimAnonymousPreTriageResponse | null>;
  clearError(): void;
  complete(): Promise<NeutralPreTriageResult>;
  loadResult(sessionId: string): Promise<NeutralPreTriageResult>;
  loadConversation(sessionId: string, signal?: AbortSignal): Promise<PreTriageConversationProjection>;
  markPendingClaim(): string;
  startFromIntake(text: string, idempotencyKey: string, mode: PreTriageMode, signal?: AbortSignal): Promise<StartPreTriageFromIntakeResponse>;
  start(pathway: PreTriagePathway, mode: PreTriageMode, patient?: AccessiblePatient | null): Promise<ActivePreTriage>;
  submit(request: SubmitPreTriageAnswersRequest): Promise<PreTriageAnswerResponse>;
};

const PreTriageContext = createContext<PreTriageContextValue | null>(null);

export function PreTriageProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus } = useAuth();
  const { activePatient, primaryPatient, refreshPatients } = usePatients();
  const [active, setActive] = useState<ActivePreTriageInternal | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [operation, setOperation] = useState<PreTriageOperation>(null);
  const [error, setError] = useState<unknown>(null);
  const [claimConfirmation, setClaimConfirmation] = useState<ClaimAnonymousPreTriageResponse | null>(null);
  const [claimRecovered, setClaimRecovered] = useState(false);
  const operationRef = useRef<PreTriageOperation>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = readAnonymousPreTriage();
      if (stored) setActive(fromStored(stored));
      setHydrated(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const begin = useCallback((next: Exclude<PreTriageOperation, null>) => {
    if (operationRef.current) throw new Error("A Pre-Triage request is already in progress.");
    operationRef.current = next;
    setOperation(next);
    setError(null);
  }, []);

  const finish = useCallback(() => {
    operationRef.current = null;
    setOperation(null);
  }, []);

  const persist = useCallback((next: ActivePreTriageInternal | null) => {
    setActive(next);
    if (next?.mode === "anonymous" && next.anonymousCapability) writeAnonymousPreTriage(toStored(next));
  }, []);

  const abandon = useCallback(() => {
    clearAnonymousPreTriage();
    setActive(null);
    setClaimConfirmation(null);
    setClaimRecovered(false);
    setError(null);
  }, []);

  const requireCurrent = useCallback(() => {
    try {
      return requireAvailable(active);
    } catch (caught) {
      if (active?.mode === "anonymous") {
        clearAnonymousPreTriage();
        setActive(null);
      }
      setError(caught);
      throw caught;
    }
  }, [active]);

  const handleFailure = useCallback(async (caught: unknown, current: ActivePreTriageInternal | null) => {
    if (caught instanceof BeeexyApiError && caught.status === 404 && current?.mode === "authenticated" && current.patientId) {
      await refreshPatients().catch(() => undefined);
    }
    if (caught instanceof BeeexyApiError && (caught.status === 401 || caught.status === 404) && current?.mode === "anonymous") {
      clearAnonymousPreTriage();
      setActive(null);
    }
    setError(caught);
  }, [refreshPatients]);

  const start = useCallback(async (pathway: PreTriagePathway, mode: PreTriageMode, patient?: AccessiblePatient | null) => {
    begin("starting");
    try {
      if (mode === "authenticated" && authStatus !== "authenticated") throw new BeeexyApiError(401);
      const request = {
        pathway,
        ...(mode === "authenticated" && patient?.accessType === "Managed" ? { patientId: patient.profileId } : {}),
      };
      const response = await beeexyPhase4Api.startPreTriage(request, mode);
      const anonymousCapability = "anonymousCapability" in response ? response.anonymousCapability : undefined;
      if (mode === "anonymous" && !anonymousCapability) throw new BeeexyApiError(500);
      const access: PreTriageAccess = mode === "anonymous"
        ? { mode: "anonymous", capability: requireCapability(anonymousCapability) }
        : { mode: "authenticated" };
      const conversation = response.conversation
        ?? await beeexyPhase4Api.getPreTriageConversation(response.sessionId, access);
      const next: ActivePreTriageInternal = {
        sessionId: response.sessionId,
        mode,
        pathway: response.pathway,
        patientId: mode === "authenticated" ? response.patientId : undefined,
        questionnaireVersion: response.questionnaire.version,
        expiresAt: response.expiresAt,
        progression: progressionFromConversation(conversation),
        conversation,
        acceptedAnswers: conversation.acceptedValues,
        pendingClaim: false,
        anonymousCapability: mode === "anonymous" ? anonymousCapability : undefined,
      };
      if (mode === "anonymous") clearAnonymousPreTriage();
      persist(next);
      setClaimConfirmation(null);
      setClaimRecovered(false);
      return publicState(next);
    } catch (caught) {
      await handleFailure(caught, active);
      throw caught;
    } finally {
      finish();
    }
  }, [active, authStatus, begin, finish, handleFailure, persist]);

  const startFromIntake = useCallback(async (
    text: string,
    idempotencyKey: string,
    mode: PreTriageMode,
    signal?: AbortSignal,
  ) => {
    begin("intaking");
    try {
      if (mode === "authenticated" && authStatus !== "authenticated") throw new BeeexyApiError(401);
      const response = await beeexyPhase4Api.startPreTriageFromIntake(
        { text },
        { mode },
        idempotencyKey,
        signal,
      );
      if (response.resolution !== "RESOLVED") return response;

      const { session } = response;
      const anonymousCapability = "anonymousCapability" in session ? session.anonymousCapability : undefined;
      if (mode === "anonymous" && !anonymousCapability) throw new BeeexyApiError(500);
      const access: PreTriageAccess = mode === "anonymous"
        ? { mode: "anonymous", capability: requireCapability(anonymousCapability) }
        : { mode: "authenticated" };
      const conversation = response.conversation
        ?? await beeexyPhase4Api.getPreTriageConversation(session.sessionId, access, signal);
      const next: ActivePreTriageInternal = {
        sessionId: session.sessionId,
        mode,
        pathway: conversation.pathway.code,
        patientId: mode === "authenticated" ? session.patientId : undefined,
        questionnaireVersion: conversation.questionnaire.version,
        expiresAt: conversation.expiresAt,
        progression: progressionFromConversation(conversation),
        conversation,
        acceptedAnswers: conversation.acceptedValues,
        pendingClaim: false,
        anonymousCapability: mode === "anonymous" ? anonymousCapability : undefined,
        transientUserTurn: text,
      };
      if (mode === "anonymous") clearAnonymousPreTriage();
      persist(next);
      setClaimConfirmation(null);
      setClaimRecovered(false);
      return { ...response, conversation };
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "AbortError")) await handleFailure(caught, active);
      throw caught;
    } finally {
      finish();
    }
  }, [active, authStatus, begin, finish, handleFailure, persist]);

  const submit = useCallback(async (request: SubmitPreTriageAnswersRequest) => {
    const current = requireCurrent();
    begin("answering");
    try {
      validateAnswerRequest(request, current.pathway);
      const response = await beeexyPhase4Api.submitPreTriageAnswers(current.sessionId, {
        ...request,
        questionnaireVersion: current.questionnaireVersion,
      }, accessFor(current));
      persist({
        ...current,
        acceptedAnswers: response.conversation.acceptedValues,
        progression: progressionFromConversation(response.conversation),
        conversation: response.conversation,
        lastAnswerResponse: response,
      });
      return response;
    } catch (caught) {
      await handleFailure(caught, current);
      throw caught;
    } finally {
      finish();
    }
  }, [begin, finish, handleFailure, persist, requireCurrent]);

  const loadConversation = useCallback(async (sessionId: string, signal?: AbortSignal) => {
    const current = active?.sessionId === sessionId ? requireCurrent() : null;
    let access: PreTriageAccess;
    if (current?.mode === "anonymous") {
      access = accessFor(current);
    } else if (authStatus === "authenticated") {
      access = { mode: "authenticated" };
    } else {
      const unavailable = new BeeexyApiError(404);
      setError(unavailable);
      throw unavailable;
    }
    begin("loading-conversation");
    try {
      const conversation = await beeexyPhase4Api.getPreTriageConversation(sessionId, access, signal);
      const next: ActivePreTriageInternal = {
        sessionId: conversation.sessionId,
        mode: current?.mode || "authenticated",
        pathway: conversation.pathway.code,
        patientId: current?.patientId,
        questionnaireVersion: conversation.questionnaire.version,
        expiresAt: conversation.expiresAt,
        progression: progressionFromConversation(conversation),
        conversation,
        acceptedAnswers: conversation.acceptedValues,
        result: current?.result,
        pendingClaim: current?.pendingClaim || false,
        anonymousCapability: current?.anonymousCapability,
        transientUserTurn: current?.transientUserTurn,
      };
      persist(next);
      return conversation;
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "AbortError")) await handleFailure(caught, current);
      throw caught;
    } finally {
      finish();
    }
  }, [active?.sessionId, authStatus, begin, finish, handleFailure, persist, requireCurrent]);

  const complete = useCallback(async () => {
    const current = requireCurrent();
    if (
      (current.conversation && current.conversation.state !== "READY_FOR_REVIEW") ||
      current.progression?.state !== "READY_TO_COMPLETE" ||
      !current.progression.readyToComplete
    ) {
      throw new BeeexyApiError(422, { problem: { status: 422, errorCode: "pre_triage.completion_incomplete" } });
    }
    begin("completing");
    try {
      const response = await beeexyPhase4Api.completePreTriage(current.sessionId, accessFor(current));
      persist({ ...current, result: response.data });
      if (current.mode === "authenticated") {
        notifyClinicalHistoryChanged(current.patientId || activePatient?.profileId || primaryPatient?.profileId);
      }
      return response.data;
    } catch (caught) {
      await handleFailure(caught, current);
      throw caught;
    } finally {
      finish();
    }
  }, [activePatient?.profileId, begin, finish, handleFailure, persist, primaryPatient?.profileId, requireCurrent]);

  const loadResult = useCallback(async (sessionId: string) => {
    const current = active?.sessionId === sessionId ? requireCurrent() : null;
    const access: PreTriageAccess = current?.mode === "anonymous"
      ? accessFor(current)
      : authStatus === "authenticated"
        ? { mode: "authenticated" }
        : (() => { throw new BeeexyApiError(404); })();
    begin("loading-result");
    try {
      const result = await beeexyPhase4Api.getPreTriageResult(sessionId, access);
      if (current) persist({ ...current, result });
      else setActive({
        sessionId,
        mode: "authenticated",
        pathway: result.primarySymptom.code,
        questionnaireVersion: result.questionnaire.version,
        expiresAt: result.completedAt,
        acceptedAnswers: {
          duration: result.duration,
          intensity: result.intensity,
          additionalSymptoms: result.additionalSymptoms,
        },
        result,
        pendingClaim: false,
      });
      return result;
    } catch (caught) {
      await handleFailure(caught, current);
      throw caught;
    } finally {
      finish();
    }
  }, [active?.sessionId, authStatus, begin, finish, handleFailure, persist, requireCurrent]);

  const markPendingClaim = useCallback(() => {
    const current = requireCurrent();
    if (current.mode !== "anonymous") throw new BeeexyApiError(409);
    const next = { ...current, pendingClaim: true };
    persist(next);
    return `/pre-triage/${encodeURIComponent(current.sessionId)}/claim`;
  }, [persist, requireCurrent]);

  const claim = useCallback(async () => {
    const current = requireCurrent();
    if (authStatus !== "authenticated" || current.mode !== "anonymous" || !current.pendingClaim || !current.anonymousCapability) {
      throw new BeeexyApiError(authStatus === "authenticated" ? 409 : 401);
    }
    begin("claiming");
    try {
      const response = await beeexyPhase4Api.claimAnonymousPreTriage(current.sessionId, current.anonymousCapability);
      clearAnonymousPreTriage();
      setClaimConfirmation(response);
      setClaimRecovered(false);
      setActive({ ...claimedPreTriageState(current, response), anonymousCapability: undefined });
      notifyClinicalHistoryChanged(response.patientId);
      return response;
    } catch (caught) {
      if (shouldReconcileClaim(caught)) {
        try {
          const result = await beeexyPhase4Api.getPreTriageResult(current.sessionId, { mode: "authenticated" });
          clearAnonymousPreTriage();
          setClaimConfirmation(null);
          setClaimRecovered(true);
          setError(null);
          setActive({ ...current, mode: "authenticated", pendingClaim: false, anonymousCapability: undefined, result });
          notifyClinicalHistoryChanged(primaryPatient?.profileId);
          return null;
        } catch {
          // Authenticated GET did not confirm ownership; preserve the original safe error.
        }
      }
      if (caught instanceof BeeexyApiError && (caught.status === 404 || caught.status === 409)) {
        clearAnonymousPreTriage();
        setActive(null);
        setError(caught);
      } else {
        setError(caught);
      }
      throw caught;
    } finally {
      finish();
    }
  }, [authStatus, begin, finish, primaryPatient?.profileId, requireCurrent]);

  const pendingClaimRoute = active?.mode === "anonymous" && active.pendingClaim
    ? `/pre-triage/${encodeURIComponent(active.sessionId)}/claim`
    : null;

  const value = useMemo<PreTriageContextValue>(() => ({
    active: active ? publicState(active) : null,
    error,
    hydrated,
    operation,
    claimConfirmation,
    claimRecovered,
    pendingClaimRoute,
    abandon,
    claim,
    clearError: () => setError(null),
    complete,
    loadResult,
    loadConversation,
    markPendingClaim,
    start,
    startFromIntake,
    submit,
  }), [active, error, hydrated, operation, claimConfirmation, claimRecovered, pendingClaimRoute, abandon, claim, complete, loadConversation, loadResult, markPendingClaim, start, startFromIntake, submit]);

  return <PreTriageContext.Provider value={value}>{children}</PreTriageContext.Provider>;
}

export function usePreTriage() {
  const context = useContext(PreTriageContext);
  if (!context) throw new Error("usePreTriage must be used inside PreTriageProvider.");
  return context;
}

function requireAvailable(active: ActivePreTriageInternal | null) {
  if (!active || (active.mode === "anonymous" && Date.parse(active.expiresAt) <= Date.now())) {
    if (active?.mode === "anonymous") clearAnonymousPreTriage();
    throw new BeeexyApiError(404);
  }
  return active;
}

function accessFor(active: ActivePreTriageInternal): PreTriageAccess {
  if (active.mode === "authenticated") return { mode: "authenticated" };
  if (!active.anonymousCapability) throw new BeeexyApiError(401);
  return { mode: "anonymous", capability: active.anonymousCapability };
}

function requireCapability(capability: string | undefined) {
  if (!capability) throw new BeeexyApiError(500);
  return capability;
}

function publicState(active: ActivePreTriageInternal): ActivePreTriage {
  return {
    sessionId: active.sessionId,
    mode: active.mode,
    pathway: active.pathway,
    patientId: active.patientId,
    questionnaireVersion: active.questionnaireVersion,
    expiresAt: active.expiresAt,
    progression: active.progression,
    conversation: active.conversation,
    acceptedAnswers: active.acceptedAnswers,
    result: active.result,
    pendingClaim: active.pendingClaim,
    lastAnswerResponse: active.lastAnswerResponse,
    transientUserTurn: active.transientUserTurn,
  };
}

function fromStored(stored: StoredAnonymousPreTriage): ActivePreTriageInternal {
  return {
    sessionId: stored.sessionId,
    mode: "anonymous",
    pathway: stored.pathway,
    questionnaireVersion: stored.questionnaireVersion,
    expiresAt: stored.expiresAt,
    anonymousCapability: stored.anonymousCapability,
    progression: stored.progression,
    acceptedAnswers: stored.acceptedAnswers || {},
    result: stored.result,
    pendingClaim: stored.pendingClaim || false,
  };
}

function toStored(active: ActivePreTriageInternal): StoredAnonymousPreTriage {
  if (!active.anonymousCapability) throw new BeeexyApiError(401);
  return {
    sessionId: active.sessionId,
    pathway: active.pathway,
    questionnaireVersion: active.questionnaireVersion,
    expiresAt: active.expiresAt,
    anonymousCapability: active.anonymousCapability,
    progression: active.progression,
    acceptedAnswers: active.acceptedAnswers,
    result: active.result,
    pendingClaim: active.pendingClaim,
  };
}

export function mergeAcceptedAnswers(
  current: StructuredPreTriageAnswers,
  acceptedValues: StructuredPreTriageAnswers | null | undefined,
  accepted: PreTriageAnswerResponse["acceptedAnswers"],
  submittedValues?: StructuredPreTriageAnswers,
) {
  const duration = acceptedValues?.duration ?? submittedValues?.duration;
  const intensity = acceptedValues?.intensity ?? submittedValues?.intensity;
  const additionalSymptoms = acceptedValues?.additionalSymptoms ?? submittedValues?.additionalSymptoms;

  return {
    ...current,
    ...(accepted.includes("DURATION") && duration ? { duration } : {}),
    ...(accepted.includes("INTENSITY") && intensity !== undefined ? { intensity } : {}),
    ...(accepted.includes("ADDITIONAL_SYMPTOMS") && additionalSymptoms !== undefined
      ? { additionalSymptoms }
      : {}),
  };
}

export function claimedPreTriageState(active: ActivePreTriage, response: ClaimAnonymousPreTriageResponse): ActivePreTriage {
  return { ...active, mode: "authenticated", patientId: response.patientId, pendingClaim: false };
}

export function shouldReconcileClaim(error: unknown) {
  return error instanceof BeeexyNetworkError || (error instanceof BeeexyApiError && error.status >= 500);
}

export function validateAnswerRequest(request: SubmitPreTriageAnswersRequest, pathway: PreTriagePathway) {
  if ("naturalLanguage" in request) {
    if (typeof request.naturalLanguage !== "string" || !request.naturalLanguage.trim() || request.naturalLanguage.length > 4_000) throw new BeeexyApiError(422);
    return;
  }
  const structured = request.structured;
  if (!structured || Object.keys(structured).length === 0) throw new BeeexyApiError(422);
  if (structured.duration && (!Number.isFinite(structured.duration.value) || structured.duration.value <= 0)) throw new BeeexyApiError(422);
  if (structured.intensity !== undefined && (!Number.isInteger(structured.intensity) || structured.intensity < 1 || structured.intensity > 10)) throw new BeeexyApiError(422);
  if (pathway === "FEVER" && structured.additionalSymptoms?.includes("FEVER")) throw new BeeexyApiError(422);
}

export function progressionFromConversation(conversation: PreTriageConversationProjection): QuestionnaireProgress {
  const answeredRequiredFields = acceptedAnswerCodes(conversation.acceptedValues);
  if (conversation.state !== "IN_PROGRESS") {
    return {
      state: "READY_TO_COMPLETE",
      answeredRequiredFields,
      missingRequiredFields: [],
      readyToComplete: true,
    };
  }

  const interaction = conversation.nextInteraction;
  return {
    state: "IN_PROGRESS",
    answeredRequiredFields,
    missingRequiredFields: interaction ? [interaction.questionCode] : [],
    nextQuestion: interaction ? legacyQuestionFromInteraction(interaction) : undefined,
    readyToComplete: false,
  };
}

function acceptedAnswerCodes(values: StructuredPreTriageAnswers): QuestionnaireProgress["answeredRequiredFields"] {
  return [
    ...(values.duration ? ["DURATION" as const] : []),
    ...(values.intensity !== undefined ? ["INTENSITY" as const] : []),
    ...(values.additionalSymptoms !== undefined ? ["ADDITIONAL_SYMPTOMS" as const] : []),
  ];
}

function legacyQuestionFromInteraction(interaction: ConversationNextInteraction): NonNullable<QuestionnaireProgress["nextQuestion"]> {
  if (interaction.inputType === "DURATION") {
    return {
      code: interaction.questionCode,
      prompt: interaction.prompt,
      answerType: "DURATION",
      allowedValues: [],
      allowedUnits: interaction.constraints.allowedUnits,
      minimum: interaction.constraints.minimum,
      maximum: null,
    };
  }
  if (interaction.inputType === "SCALE") {
    return {
      code: interaction.questionCode,
      prompt: interaction.prompt,
      answerType: "INTEGER_SCALE",
      allowedValues: [],
      allowedUnits: [],
      minimum: interaction.constraints.minimum,
      maximum: interaction.constraints.maximum,
    };
  }
  return {
    code: interaction.questionCode,
    prompt: interaction.prompt,
    answerType: "MULTIPLE_CHOICE",
    allowedValues: interaction.options.map((option) => option.value),
    allowedUnits: [],
    minimum: interaction.constraints.minimumSelections,
    maximum: interaction.constraints.maximumSelections,
  };
}
