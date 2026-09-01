"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppointmentDetail } from "@/lib/beeexy-api/contracts";
import { beeexyPhase8Api } from "@/lib/beeexy-api/phase-8-api";
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

  const refresh = useCallback(async () => {
    if (!appointmentId) return null;
    requestRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    requestRef.current = controller;
    setState({ ...EMPTY_DETAIL, scopeId: appointmentId, status: "loading" });

    try {
      const detail = await beeexyPhase8Api.getAppointment(appointmentId, controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return null;
      setState({ detail, error: null, scopeId: appointmentId, status: "ready" });
      return detail;
    } catch (error) {
      if (isAppointmentAbortError(error) || requestId !== requestIdRef.current) return null;
      setState({ detail: null, error, scopeId: appointmentId, status: "error" });
      return null;
    }
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
    refresh,
  };
}
