"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppointmentListQuery, AppointmentSummary } from "@/lib/beeexy-api/contracts";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import {
  appendUniqueAppointments,
  appointmentMatchesScope,
  buildAppointmentListQuery,
  isAppointmentAbortError,
  isInvalidAppointmentCursor,
  type AppointmentScope,
} from "./appointment-list-state";

type AppointmentListState = {
  baseQuery: AppointmentListQuery | null;
  boundary: string;
  error: unknown;
  isLoadingMore: boolean;
  items: AppointmentSummary[];
  nextCursor: string | null;
  scopeKey: string;
  status: "idle" | "loading" | "ready" | "error";
};

const EMPTY_STATE: AppointmentListState = {
  baseQuery: null,
  boundary: "",
  error: null,
  isLoadingMore: false,
  items: [],
  nextCursor: null,
  scopeKey: "",
  status: "idle",
};

async function requestVisiblePage(
  query: AppointmentListQuery,
  scope: AppointmentScope,
  boundary: string,
  cursor: string | undefined,
  signal: AbortSignal,
) {
  let nextCursor = cursor;
  let items: AppointmentSummary[] = [];

  do {
    const page = await beeexyPhase8Api.listAppointments(
      nextCursor === undefined ? query : { ...query, cursor: nextCursor },
      signal,
    );
    items = appendUniqueAppointments(
      items,
      page.items.filter((appointment) => appointmentMatchesScope(appointment, scope, boundary)),
    );
    nextCursor = page.nextCursor ?? undefined;
  } while (scope === "upcoming" && items.length === 0 && nextCursor !== undefined && !signal.aborted);

  return { items, nextCursor: nextCursor ?? null };
}

export function useAppointments(
  patientId: string | undefined,
  scope: AppointmentScope,
  onUnavailable: () => void | Promise<void>,
) {
  const [state, setState] = useState<AppointmentListState>(EMPTY_STATE);
  const requestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const scopeKey = patientId ? `${patientId}:${scope}` : "";

  const loadFirstPage = useCallback(async () => {
    if (!patientId) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    const boundary = new Date().toISOString();
    const baseQuery = buildAppointmentListQuery(patientId, scope, boundary);
    requestRef.current = controller;
    setState({ ...EMPTY_STATE, baseQuery, boundary, scopeKey, status: "loading" });

    try {
      const page = await requestVisiblePage(baseQuery, scope, boundary, undefined, controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setState({
        baseQuery,
        boundary,
        error: null,
        isLoadingMore: false,
        items: page.items,
        nextCursor: page.nextCursor,
        scopeKey,
        status: "ready",
      });
    } catch (error) {
      if (isAppointmentAbortError(error) || requestId !== requestIdRef.current) return;
      if (error instanceof BeeexyApiError && error.status === 404) await onUnavailable();
      if (requestId !== requestIdRef.current) return;
      setState({ ...EMPTY_STATE, error, scopeKey, status: "error" });
    }
  }, [onUnavailable, patientId, scope, scopeKey]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void loadFirstPage());
    return () => {
      cancelAnimationFrame(frame);
      requestIdRef.current += 1;
      requestRef.current?.abort();
    };
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (
      !patientId
      || state.scopeKey !== scopeKey
      || !state.baseQuery
      || !state.boundary
      || !state.nextCursor
      || state.isLoadingMore
    ) return;

    const cursor = state.nextCursor;
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    requestRef.current = controller;
    setState((current) => ({ ...current, error: null, isLoadingMore: true }));

    try {
      const page = await requestVisiblePage(state.baseQuery, scope, state.boundary, cursor, controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setState((current) => current.scopeKey === scopeKey ? {
        ...current,
        error: null,
        isLoadingMore: false,
        items: appendUniqueAppointments(current.items, page.items),
        nextCursor: page.nextCursor,
      } : current);
    } catch (error) {
      if (isAppointmentAbortError(error) || requestId !== requestIdRef.current) return;
      if (error instanceof BeeexyApiError && error.status === 404) await onUnavailable();
      if (requestId !== requestIdRef.current) return;
      setState((current) => current.scopeKey === scopeKey ? {
        ...current,
        error,
        isLoadingMore: false,
        nextCursor: isInvalidAppointmentCursor(error) ? null : current.nextCursor,
      } : current);
    }
  }, [onUnavailable, patientId, scope, scopeKey, state.baseQuery, state.boundary, state.isLoadingMore, state.nextCursor, state.scopeKey]);

  const inScope = Boolean(scopeKey) && state.scopeKey === scopeKey;
  return {
    error: inScope ? state.error : null,
    isLoading: Boolean(patientId) && (!inScope || state.status === "idle" || state.status === "loading"),
    isLoadingMore: inScope && state.isLoadingMore,
    items: inScope ? state.items : [],
    loadMore,
    nextCursor: inScope ? state.nextCursor : null,
    refresh: loadFirstPage,
  };
}
