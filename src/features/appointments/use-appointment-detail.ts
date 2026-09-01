"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppointmentDetail, AppointmentSummary } from "@/lib/beeexy-api/contracts";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
import { isAppointmentDetailNotFound } from "./appointment-detail-state";
import { isAppointmentAbortError } from "./appointment-list-state";

type AppointmentDetailState = {
  detail: AppointmentDetail | null;
  error: unknown;
  scopeId: string;
  status: "idle" | "loading" | "ready" | "error";
};

const EMPTY_DETAIL: AppointmentDetailState = {
  detail: null,
  error: null,
  scopeId: "",
  status: "idle",
};

export function useAppointmentDetail(appointmentId: string) {
  const [state, setState] = useState<AppointmentDetailState>(EMPTY_DETAIL);
  const requestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async (options: { preserveCurrent?: boolean } = {}) => {
    if (!appointmentId) return null;
    requestRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    requestRef.current = controller;
    setState((current) => options.preserveCurrent
      && current.scopeId === appointmentId
      && current.detail
      ? { ...current, error: null, status: "ready" }
      : { ...EMPTY_DETAIL, scopeId: appointmentId, status: "loading" });

    try {
      const detail = await beeexyPhase8Api.getAppointment(appointmentId, controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return null;
      setState({ detail, error: null, scopeId: appointmentId, status: "ready" });
      return detail;
    } catch (error) {
      if (isAppointmentAbortError(error) || requestId !== requestIdRef.current) return null;
      setState((current) => options.preserveCurrent
        && !isAppointmentDetailNotFound(error)
        && current.scopeId === appointmentId
        && current.detail
        ? { ...current, error: null, status: "ready" }
        : { detail: null, error, scopeId: appointmentId, status: "error" });
      return null;
    }
  }, [appointmentId]);

  const applySummary = useCallback((summary: AppointmentSummary) => {
    if (summary.appointmentId !== appointmentId) return;
    setState((current) => current.scopeId === appointmentId && current.detail
      ? { ...current, detail: { ...current.detail, ...summary }, error: null, status: "ready" }
      : current);
  }, [appointmentId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void refresh());
    return () => {
      cancelAnimationFrame(frame);
      requestIdRef.current += 1;
      requestRef.current?.abort();
    };
  }, [refresh]);

  const inScope = state.scopeId === appointmentId;
  return {
    detail: inScope ? state.detail : null,
    error: inScope ? state.error : null,
    isLoading: !inScope || state.status === "idle" || state.status === "loading",
    applySummary,
    refresh,
  };
}
