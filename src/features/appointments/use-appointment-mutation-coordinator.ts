"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AppointmentMutationKind = "cancel" | "reschedule";
type ActiveMutation = { kind: AppointmentMutationKind; scopeId: string } | null;

export function useAppointmentMutationCoordinator(appointmentId: string) {
  const [state, setState] = useState<ActiveMutation>(null);
  const activeRef = useRef<ActiveMutation>(null);

  useEffect(() => () => {
    activeRef.current = null;
  }, [appointmentId]);

  const acquire = useCallback((kind: AppointmentMutationKind) => {
    if (activeRef.current?.scopeId === appointmentId) return false;
    const mutation = { kind, scopeId: appointmentId };
    activeRef.current = mutation;
    setState(mutation);
    return true;
  }, [appointmentId]);

  const release = useCallback((kind: AppointmentMutationKind) => {
    if (activeRef.current?.kind !== kind || activeRef.current.scopeId !== appointmentId) return;
    activeRef.current = null;
    setState(null);
  }, [appointmentId]);

  return {
    acquire,
    activeMutation: state?.scopeId === appointmentId ? state.kind : null,
    release,
  };
}

export type AppointmentMutationCoordinator = ReturnType<typeof useAppointmentMutationCoordinator>;
