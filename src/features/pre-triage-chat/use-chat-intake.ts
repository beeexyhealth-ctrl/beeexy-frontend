"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PreTriagePathway,
  StartPreTriageFromIntakeResponse,
} from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export type ChatIntakeState =
  | { kind: "idle" }
  | { kind: "pending"; text: string }
  | { kind: "resolved"; text: string }
  | { kind: "ambiguous"; text: string; candidates: PreTriagePathway[] }
  | { kind: "unresolved"; text: string }
  | { kind: "retryable"; text: string; idempotencyKey: string; reason: "network" | "unavailable" | "server" }
  | { kind: "conflict"; text: string; reason: "key-reused" | "anonymous-replay" | "operation" }
  | { kind: "rejected"; text: string };

type ExecuteIntake = (
  text: string,
  idempotencyKey: string,
  signal: AbortSignal,
) => Promise<StartPreTriageFromIntakeResponse>;

type UseChatIntakeOptions = {
  execute: ExecuteIntake;
  onResolved: (response: Extract<StartPreTriageFromIntakeResponse, { resolution: "RESOLVED" }>) => Promise<void> | void;
};

export function useChatIntake({ execute, onResolved }: UseChatIntakeOptions) {
  const [state, setState] = useState<ChatIntakeState>({ kind: "idle" });
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const executeRef = useRef(execute);
  const onResolvedRef = useRef(onResolved);

  useEffect(() => {
    executeRef.current = execute;
    onResolvedRef.current = onResolved;
  }, [execute, onResolved]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (text: string, idempotencyKey: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: "pending", text });

    try {
      const response = await executeRef.current(text, idempotencyKey, controller.signal);
      if (response.resolution === "RESOLVED") {
        setState({ kind: "resolved", text });
        await onResolvedRef.current(response);
      } else if (response.resolution === "AMBIGUOUS") {
        setState({ kind: "ambiguous", text, candidates: response.candidatePathways || [] });
      } else {
        setState({ kind: "unresolved", text });
      }
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setState(intakeFailureState(caught, text, idempotencyKey));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      inFlightRef.current = false;
    }
  }, []);

  const submit = useCallback(async (value: string) => {
    const text = value.trim();
    if (!text || text.length > 4_000 || inFlightRef.current) return;
    await run(text, createIntakeIdempotencyKey());
  }, [run]);

  const retry = useCallback(async () => {
    if (state.kind !== "retryable" || inFlightRef.current) return;
    await run(state.text, state.idempotencyKey);
  }, [run, state]);

  const reset = useCallback(() => {
    if (!inFlightRef.current) setState({ kind: "idle" });
  }, []);

  return { reset, retry, state, submit };
}

export function createIntakeIdempotencyKey() {
  const secureCrypto = globalThis.crypto;
  if (typeof secureCrypto?.randomUUID === "function") return secureCrypto.randomUUID();
  if (typeof secureCrypto?.getRandomValues !== "function") {
    throw new Error("Secure random values are unavailable.");
  }

  const bytes = secureCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function intakeFailureState(caught: unknown, text: string, idempotencyKey: string): ChatIntakeState {
  if (caught instanceof BeeexyNetworkError) {
    return { kind: "retryable", text, idempotencyKey, reason: "network" };
  }
  if (caught instanceof BeeexyApiError) {
    const errorCode = caught.problem?.errorCode;
    if (caught.status === 503 && errorCode === "pre_triage.interpretation_unavailable") {
      return { kind: "retryable", text, idempotencyKey, reason: "unavailable" };
    }
    if (caught.status >= 500) {
      return { kind: "retryable", text, idempotencyKey, reason: "server" };
    }
    if (caught.status === 409 && errorCode === "pre_triage.idempotency_key_reused") {
      return { kind: "conflict", text, reason: "key-reused" };
    }
    if (caught.status === 409 && errorCode === "pre_triage.anonymous_replay_capability_required") {
      return { kind: "conflict", text, reason: "anonymous-replay" };
    }
    if (caught.status === 409) return { kind: "conflict", text, reason: "operation" };
  }
  return { kind: "rejected", text };
}
