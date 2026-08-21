"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/features/auth/auth-provider";
import type {
  AccessiblePatient,
  CareRelationship,
  CreateManagedPatientRequest,
  CreateManagedPatientResponse,
  CurrentPatient,
  PatientDemographics,
  PatientDetail,
  UpdatePatientRequest,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase3Api } from "@/lib/beeexy-api/phase-3-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import {
  completeCareChoice,
  hasCompletedCareChoice,
  readActivePatientId,
  writeActivePatientId,
} from "./patient-storage";
import { detailToCurrentPatient, primaryCompletionPatch, resolveActivePatient } from "./patient-state";
import { PatientConcurrencyError } from "./phase-3-errors";

export type PatientBootstrapStatus = "idle" | "loading" | "ready" | "error";

type PatientContextValue = {
  activePatient: AccessiblePatient | null;
  bootstrapStatus: PatientBootstrapStatus;
  careChoiceComplete: boolean;
  details: Record<string, PatientDetail>;
  patients: AccessiblePatient[];
  primaryPatient: CurrentPatient | null;
  relationships: CareRelationship[];
  unavailableNotice: string | null;
  choosePrimary(): void;
  clearUnavailableNotice(): void;
  completePrimaryProfile(demographics: PatientDemographics): Promise<PatientDetail>;
  createManagedPatient(request: CreateManagedPatientRequest, activate: boolean): Promise<CreateManagedPatientResponse>;
  getPatient(patientId: string): Promise<PatientDetail>;
  refreshPatients(): Promise<AccessiblePatient[]>;
  refreshRelationships(): Promise<CareRelationship[]>;
  retryBootstrap(): Promise<void>;
  revokeRelationship(relationshipId: string, subjectProfileId: string): Promise<void>;
  selectActivePatient(profileId: string): boolean;
  updatePatient(patientId: string, patch: UpdatePatientRequest): Promise<PatientDetail>;
};

const PatientContext = createContext<PatientContextValue | null>(null);

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const { patient: authenticatedPatient, status: authStatus } = useAuth();
  const [bootstrapStatus, setBootstrapStatus] = useState<PatientBootstrapStatus>("idle");
  const [primaryPatient, setPrimaryPatient] = useState<CurrentPatient | null>(null);
  const [patients, setPatients] = useState<AccessiblePatient[]>([]);
  const [relationships, setRelationships] = useState<CareRelationship[]>([]);
  const [activePatient, setActivePatient] = useState<AccessiblePatient | null>(null);
  const [careChoiceComplete, setCareChoiceComplete] = useState(false);
  const [details, setDetails] = useState<Record<string, PatientDetail>>({});
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(null);
  const activePatientRef = useRef<AccessiblePatient | null>(null);
  const primaryPatientRef = useRef<CurrentPatient | null>(null);

  useEffect(() => { activePatientRef.current = activePatient; }, [activePatient]);
  useEffect(() => { primaryPatientRef.current = primaryPatient; }, [primaryPatient]);

  const applyPatients = useCallback((nextPatients: AccessiblePatient[], preferredProfileId?: string | null) => {
    const primaryId = primaryPatientRef.current?.profileId;
    const preferred = preferredProfileId === undefined
      ? activePatientRef.current?.profileId ?? (primaryId ? readActivePatientId(primaryId) : null)
      : preferredProfileId;
    const resolved = resolveActivePatient(nextPatients, preferred);
    setPatients(nextPatients);
    setActivePatient(resolved);
    if (resolved && primaryId) writeActivePatientId(primaryId, resolved.profileId);
    return resolved;
  }, []);

  const refreshPatients = useCallback(async () => {
    const response = await beeexyPhase3Api.listAccessiblePatients();
    applyPatients(response.patients);
    return response.patients;
  }, [applyPatients]);

  const refreshRelationships = useCallback(async () => {
    const response = await beeexyPhase3Api.listCareRelationships();
    setRelationships(response.relationships);
    return response.relationships;
  }, []);

  const bootstrap = useCallback(async (currentPatient: CurrentPatient) => {
    setBootstrapStatus("loading");
    setUnavailableNotice(null);
    setPrimaryPatient(currentPatient);
    primaryPatientRef.current = currentPatient;
    setCareChoiceComplete(hasCompletedCareChoice(currentPatient.profileId));
    try {
      const response = await beeexyPhase3Api.listAccessiblePatients();
      applyPatients(response.patients, readActivePatientId(currentPatient.profileId));
      setBootstrapStatus("ready");
      void refreshRelationships().catch(() => undefined);
    } catch (error) {
      setBootstrapStatus("error");
      throw error;
    }
  }, [applyPatients, refreshRelationships]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !authenticatedPatient) {
      const frame = requestAnimationFrame(() => {
        setBootstrapStatus("idle");
        setPrimaryPatient(null);
        primaryPatientRef.current = null;
        setPatients([]);
        setRelationships([]);
        setActivePatient(null);
        setDetails({});
      });
      return () => cancelAnimationFrame(frame);
    }
    const frame = requestAnimationFrame(() => void bootstrap(authenticatedPatient).catch(() => undefined));
    return () => cancelAnimationFrame(frame);
  }, [authStatus, authenticatedPatient, bootstrap]);

  const retryBootstrap = useCallback(async () => {
    if (authenticatedPatient) await bootstrap(authenticatedPatient);
  }, [authenticatedPatient, bootstrap]);

  const selectActivePatient = useCallback((profileId: string) => {
    const selected = patients.find((patient) => patient.profileId === profileId);
    const primaryId = primaryPatientRef.current?.profileId;
    if (!selected || !primaryId) return false;
    setActivePatient(selected);
    writeActivePatientId(primaryId, selected.profileId);
    return true;
  }, [patients]);

  const choosePrimary = useCallback(() => {
    const primary = patients.find((patient) => patient.accessType === "Primary") ?? patients[0];
    const primaryId = primaryPatientRef.current?.profileId;
    if (!primary || !primaryId) return;
    setActivePatient(primary);
    writeActivePatientId(primaryId, primary.profileId);
    completeCareChoice(primaryId);
    setCareChoiceComplete(true);
  }, [patients]);

  const completePrimaryProfile = useCallback(async (demographics: PatientDemographics) => {
    const current = primaryPatientRef.current;
    if (!current) throw new BeeexyApiError(401);
    try {
      const updated = await beeexyPhase3Api.updatePatient(current.profileId, primaryCompletionPatch(current, demographics));
      const nextPrimary = detailToCurrentPatient(updated, current);
      primaryPatientRef.current = nextPrimary;
      setPrimaryPatient(nextPrimary);
      setDetails((existing) => ({ ...existing, [updated.profileId]: updated }));
      await refreshPatients();
      return updated;
    } catch (error) {
      if (error instanceof BeeexyApiError && error.status === 409) {
        const latest = await beeexyPhase3Api.getPatient(current.profileId);
        const nextPrimary = detailToCurrentPatient(latest, current);
        primaryPatientRef.current = nextPrimary;
        setPrimaryPatient(nextPrimary);
        setDetails((existing) => ({ ...existing, [latest.profileId]: latest }));
        throw new PatientConcurrencyError(latest);
      }
      throw error;
    }
  }, [refreshPatients]);

  const createManagedPatient = useCallback(async (request: CreateManagedPatientRequest, activate: boolean) => {
    let response: CreateManagedPatientResponse;
    try {
      response = await beeexyPhase3Api.createManagedPatient(request);
    } catch (error) {
      if (error instanceof BeeexyApiError && error.status === 409) {
        const [patientResponse, relationshipResponse] = await Promise.all([
          beeexyPhase3Api.listAccessiblePatients(),
          beeexyPhase3Api.listCareRelationships(),
        ]);
        setRelationships(relationshipResponse.relationships);
        applyPatients(patientResponse.patients);
      }
      throw error;
    }
    const [patientResponse, relationshipResponse] = await Promise.all([
      beeexyPhase3Api.listAccessiblePatients(),
      beeexyPhase3Api.listCareRelationships(),
    ]);
    setRelationships(relationshipResponse.relationships);
    setDetails((existing) => ({ ...existing, [response.patient.profileId]: response.patient }));
    applyPatients(
      patientResponse.patients,
      activate ? response.patient.profileId : activePatientRef.current?.profileId,
    );
    if (activate) {
      const primaryId = primaryPatientRef.current?.profileId;
      if (primaryId) {
        completeCareChoice(primaryId);
        setCareChoiceComplete(true);
      }
    }
    return response;
  }, [applyPatients]);

  const handleUnavailable = useCallback(async (patientId: string) => {
    setDetails((existing) => {
      const next = { ...existing };
      delete next[patientId];
      return next;
    });
    setUnavailableNotice("This profile is no longer available.");
    await refreshPatients().catch(() => undefined);
  }, [refreshPatients]);

  const getPatient = useCallback(async (patientId: string) => {
    try {
      const detail = await beeexyPhase3Api.getPatient(patientId);
      setDetails((existing) => ({ ...existing, [patientId]: detail }));
      return detail;
    } catch (error) {
      if (error instanceof BeeexyApiError && error.status === 404) await handleUnavailable(patientId);
      throw error;
    }
  }, [handleUnavailable]);

  const applyUpdatedDetail = useCallback((updated: PatientDetail) => {
    setDetails((existing) => ({ ...existing, [updated.profileId]: updated }));
    setPatients((existing) => existing.map((patient) => patient.profileId === updated.profileId
      ? { ...patient, firstName: updated.firstName, lastName: updated.lastName }
      : patient));
    setActivePatient((existing) => existing?.profileId === updated.profileId
      ? { ...existing, firstName: updated.firstName, lastName: updated.lastName }
      : existing);
    const current = primaryPatientRef.current;
    if (current?.profileId === updated.profileId) {
      const nextPrimary = detailToCurrentPatient(updated, current);
      primaryPatientRef.current = nextPrimary;
      setPrimaryPatient(nextPrimary);
    }
  }, []);

  const updatePatient = useCallback(async (patientId: string, patch: UpdatePatientRequest) => {
    try {
      const updated = await beeexyPhase3Api.updatePatient(patientId, patch);
      applyUpdatedDetail(updated);
      return updated;
    } catch (error) {
      if (error instanceof BeeexyApiError && error.status === 409) {
        const latest = await beeexyPhase3Api.getPatient(patientId);
        applyUpdatedDetail(latest);
        throw new PatientConcurrencyError(latest);
      } else if (error instanceof BeeexyApiError && error.status === 404) {
        await handleUnavailable(patientId);
      }
      throw error;
    }
  }, [applyUpdatedDetail, handleUnavailable]);

  const revokeRelationship = useCallback(async (relationshipId: string, subjectProfileId: string) => {
    try {
      await beeexyPhase3Api.revokeCareRelationship(relationshipId);
    } catch (error) {
      if (!(error instanceof BeeexyApiError && error.status === 404)) throw error;
      setUnavailableNotice("This relationship is no longer available.");
    }
    setDetails((existing) => {
      const next = { ...existing };
      delete next[subjectProfileId];
      return next;
    });
    const [patientResponse, relationshipResponse] = await Promise.all([
      beeexyPhase3Api.listAccessiblePatients(),
      beeexyPhase3Api.listCareRelationships(),
    ]);
    setRelationships(relationshipResponse.relationships);
    applyPatients(patientResponse.patients);
  }, [applyPatients]);

  const value = useMemo<PatientContextValue>(() => ({
    activePatient,
    bootstrapStatus,
    careChoiceComplete,
    details,
    patients,
    primaryPatient,
    relationships,
    unavailableNotice,
    choosePrimary,
    clearUnavailableNotice: () => setUnavailableNotice(null),
    completePrimaryProfile,
    createManagedPatient,
    getPatient,
    refreshPatients,
    refreshRelationships,
    retryBootstrap,
    revokeRelationship,
    selectActivePatient,
    updatePatient,
  }), [
    activePatient, bootstrapStatus, careChoiceComplete, choosePrimary, completePrimaryProfile,
    createManagedPatient, details, getPatient, patients, primaryPatient, refreshPatients,
    refreshRelationships, relationships, retryBootstrap, revokeRelationship, selectActivePatient,
    unavailableNotice, updatePatient,
  ]);

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
}

export function usePatients() {
  const context = useContext(PatientContext);
  if (!context) throw new Error("usePatients must be used inside PatientProvider.");
  return context;
}
