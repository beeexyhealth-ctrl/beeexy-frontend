"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClinicalHistoryEventDetail, ClinicalHistoryItem } from "@/lib/beeexy-api/contracts";
import { beeexyPhase5Api } from "@/lib/beeexy-api/phase-5-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import {
  CLINICAL_HISTORY_REFRESH_EVENT,
  clinicalHistoryRefreshPatientId,
} from "./clinical-history-refresh";
import { appendUniqueHistoryItems, isAbortError, isInvalidHistoryCursor } from "./clinical-history-state";

const PAGE_SIZE = 20;

type HistoryState = {
  error: unknown;
  isLoadingMore: boolean;
  items: ClinicalHistoryItem[];
  nextCursor: string | null;
  scopePatientId: string;
  status: "idle" | "loading" | "ready" | "error";
};

const EMPTY_HISTORY: HistoryState = {
  error: null,
  isLoadingMore: false,
  items: [],
  nextCursor: null,
  scopePatientId: "",
  status: "idle",
};

export function useClinicalHistory(patientId: string | undefined, onUnavailable: () => void | Promise<void>) {
  const [state, setState] = useState<HistoryState>(EMPTY_HISTORY);
  const requestRef = useRef<{ controller: AbortController; id: number } | null>(null);
  const requestIdRef = useRef(0);

  const loadFirstPage = useCallback(async () => {
    if (!patientId) return;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    requestRef.current = { controller, id: requestId };
    setState({ ...EMPTY_HISTORY, scopePatientId: patientId, status: "loading" });

    try {
      const page = await beeexyPhase5Api.getClinicalHistory(patientId, {
        pageSize: PAGE_SIZE,
        eventType: "COMPLETED_PRE_TRIAGE",
      }, controller.signal);
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setState({
        error: null,
        isLoadingMore: false,
        items: page.items,
        nextCursor: page.nextCursor,
        scopePatientId: patientId,
        status: "ready",
      });
    } catch (error) {
      if (isAbortError(error) || requestId !== requestIdRef.current) return;
      if (error instanceof BeeexyApiError && error.status === 404) await onUnavailable();
      setState({ ...EMPTY_HISTORY, error, scopePatientId: patientId, status: "error" });
    }
  }, [onUnavailable, patientId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void loadFirstPage());
    return () => {
      cancelAnimationFrame(frame);
      requestIdRef.current += 1;
      requestRef.current?.controller.abort();
    };
  }, [loadFirstPage]);

  useEffect(() => {
    function refreshForPatient(event: Event) {
      if (clinicalHistoryRefreshPatientId(event) === patientId) void loadFirstPage();
    }
    window.addEventListener(CLINICAL_HISTORY_REFRESH_EVENT, refreshForPatient);
    return () => window.removeEventListener(CLINICAL_HISTORY_REFRESH_EVENT, refreshForPatient);
  }, [loadFirstPage, patientId]);

  const loadMore = useCallback(async () => {
    if (!patientId || state.scopePatientId !== patientId || !state.nextCursor || state.isLoadingMore) return;
    const cursor = state.nextCursor;
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    requestRef.current = { controller, id: requestId };
    setState((current) => ({ ...current, error: null, isLoadingMore: true }));

    try {
      const page = await beeexyPhase5Api.getClinicalHistory(patientId, {
        cursor,
        pageSize: PAGE_SIZE,
        eventType: "COMPLETED_PRE_TRIAGE",
      }, controller.signal);
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setState((current) => current.scopePatientId === patientId ? {
        ...current,
        error: null,
        isLoadingMore: false,
        items: appendUniqueHistoryItems(current.items, page.items),
        nextCursor: page.nextCursor,
      } : current);
    } catch (error) {
      if (isAbortError(error) || requestId !== requestIdRef.current) return;
      if (error instanceof BeeexyApiError && error.status === 404) await onUnavailable();
      setState((current) => current.scopePatientId === patientId ? {
        ...current,
        error,
        isLoadingMore: false,
        nextCursor: isInvalidHistoryCursor(error) ? null : current.nextCursor,
      } : current);
    }
  }, [onUnavailable, patientId, state.isLoadingMore, state.nextCursor, state.scopePatientId]);

  const inScope = Boolean(patientId) && state.scopePatientId === patientId;
  return {
    error: inScope ? state.error : null,
    isLoading: !inScope || state.status === "idle" || state.status === "loading",
    isLoadingMore: inScope && state.isLoadingMore,
    items: inScope ? state.items : [],
    loadMore,
    nextCursor: inScope ? state.nextCursor : null,
    refresh: loadFirstPage,
  };
}

type DetailState = {
  detail: ClinicalHistoryEventDetail | null;
  error: unknown;
  scope: string;
  status: "idle" | "loading" | "ready" | "error";
};

const EMPTY_DETAIL: DetailState = { detail: null, error: null, scope: "", status: "idle" };

export function useClinicalHistoryEvent(
  patientId: string | undefined,
  eventId: string,
  onUnavailable: () => void | Promise<void>,
) {
  const [state, setState] = useState<DetailState>(EMPTY_DETAIL);
  const requestRef = useRef<{ controller: AbortController; id: number } | null>(null);
  const requestIdRef = useRef(0);
  const scope = patientId ? `${patientId}:${eventId}` : "";

  const refresh = useCallback(async () => {
    if (!patientId || !eventId) return null;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    requestRef.current = { controller, id: requestId };
    setState((current) => current.scope === scope && current.detail
      ? { ...current, error: null }
      : { ...EMPTY_DETAIL, scope, status: "loading" });

    try {
      const detail = await beeexyPhase5Api.getClinicalHistoryEvent(patientId, eventId, controller.signal);
      if (requestId !== requestIdRef.current || controller.signal.aborted) return null;
      setState({ detail, error: null, scope, status: "ready" });
      return detail;
    } catch (error) {
      if (isAbortError(error) || requestId !== requestIdRef.current) return null;
      if (error instanceof BeeexyApiError && error.status === 404) await onUnavailable();
      setState({ detail: null, error, scope, status: "error" });
      throw error;
    }
  }, [eventId, onUnavailable, patientId, scope]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void refresh().catch(() => undefined));
    return () => {
      cancelAnimationFrame(frame);
      requestIdRef.current += 1;
      requestRef.current?.controller.abort();
    };
  }, [refresh]);

  const inScope = Boolean(scope) && state.scope === scope;
  return {
    detail: inScope ? state.detail : null,
    error: inScope ? state.error : null,
    isLoading: !inScope || state.status === "idle" || state.status === "loading",
    refresh,
  };
}
