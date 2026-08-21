"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import type { PatientDetail } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { DemographicsFields } from "./demographics-fields";
import { EMPTY_DEMOGRAPHICS, type DemographicField, type DemographicsDraft, type FieldErrors, validateDemographics } from "./forms";
import { fieldForPhase3Error, PatientConcurrencyError, phase3ErrorMessage } from "./phase-3-errors";
import { usePatients } from "./patient-provider";
import { buildPatientPatch } from "./patient-state";

export function EditPatientForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { details, getPatient, updatePatient } = usePatients();
  const initialDetail = details[patientId] ?? null;
  const [detail, setDetail] = useState<PatientDetail | null>(initialDetail);
  const [draft, setDraft] = useState<DemographicsDraft>(initialDetail ? toDraft(initialDetail) : EMPTY_DEMOGRAPHICS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (detail) return;
    getPatient(patientId)
      .then((patient) => { setDetail(patient); setDraft(toDraft(patient)); })
      .catch((error) => {
        if (error instanceof BeeexyApiError && error.status === 404) router.replace("/my-health/circle");
        else setMessage(phase3ErrorMessage(error, "load"));
      });
  }, [detail, getPatient, patientId, router]);

  useEffect(() => { if (message) alertRef.current?.focus(); }, [message]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    const validation = validateDemographics(draft);
    setErrors(validation.errors);
    if (!validation.value) {
      setMessage("Please review the highlighted fields.");
      return;
    }
    const patch = buildPatientPatch(detail, validation.value);
    if (Object.keys(patch).length === 1) {
      setMessage("No changes to save.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const updated = await updatePatient(patientId, patch);
      setDetail(updated);
      setDraft(toDraft(updated));
      router.replace(`/my-health/circle/${patientId}`);
    } catch (error) {
      if (error instanceof PatientConcurrencyError) {
        setDetail(error.latest);
        setDraft(toDraft(error.latest));
      }
      const field = fieldForPhase3Error(error);
      if (field) setErrors({ [field]: "Check this value and try again." });
      setMessage(phase3ErrorMessage(error, "update"));
      if (error instanceof BeeexyApiError && error.status === 404) router.replace("/my-health/circle");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell>
      <div className="page circle-page patient-editor-page">
        <Link className="back-link" href={`/my-health/circle/${patientId}`}><Icon name="arrow-left" size={15} />Profile</Link>
        <header className="patient-editor-heading"><span><Icon name="user" size={21} /></span><div><p className="entry-eyebrow">Patient profile</p><h1>Edit demographics</h1><p>Changes are shared with other current managers.</p></div></header>
        {!detail ? <div className="patient-detail-loading" role="status" aria-label="Loading patient profile"><span /><span /><span /></div> : (
          <form className="patient-form" onSubmit={submit} noValidate>
            {message && <div className="patient-form-alert" ref={alertRef} role="alert" tabIndex={-1}>{message}</div>}
            <DemographicsFields disabled={pending} draft={draft} errors={errors} onChange={(field: DemographicField, value) => {
              setDraft((current) => ({ ...current, [field]: value }));
              setErrors((current) => ({ ...current, [field]: undefined }));
            }} />
            <button className="button primary wide" disabled={pending} type="submit">{pending ? "Saving…" : "Save changes"}</button>
          </form>
        )}
      </div>
    </AppShell>
  );
}

function toDraft(detail: PatientDetail): DemographicsDraft {
  return {
    firstName: detail.firstName || "",
    lastName: detail.lastName || "",
    dateOfBirth: detail.dateOfBirth || "",
    sexAssignedAtBirth: detail.sexAssignedAtBirth || "",
    state: detail.state || "",
  };
}
