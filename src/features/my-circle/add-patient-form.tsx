"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import type { RelationshipType } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { CARE_ATTESTATION, RELATIONSHIP_OPTIONS } from "./constants";
import { DemographicsFields } from "./demographics-fields";
import { EMPTY_DEMOGRAPHICS, type DemographicField, type DemographicsDraft, type FieldErrors, validateDemographics } from "./forms";
import { fieldForPhase3Error, phase3ErrorMessage } from "./phase-3-errors";
import { usePatients } from "./patient-provider";

export function AddPatientForm({ initialFlow }: { initialFlow: boolean }) {
  const router = useRouter();
  const { createManagedPatient } = usePatients();
  const [draft, setDraft] = useState<DemographicsDraft>(EMPTY_DEMOGRAPHICS);
  const [relationshipType, setRelationshipType] = useState<RelationshipType | "">("");
  const [attestationAccepted, setAttestationAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const attestationConfigured = Boolean(CARE_ATTESTATION.copy && CARE_ATTESTATION.version);

  useEffect(() => { if (message) alertRef.current?.focus(); }, [message]);

  function updateField(field: DemographicField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateDemographics(draft);
    setErrors(validation.errors);
    if (!validation.value || !relationshipType || !attestationAccepted || !attestationConfigured) {
      setMessage(!attestationConfigured
        ? "Approved attestation content must be configured before a person can be added."
        : "Please complete every field and accept the attestation.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const result = await createManagedPatient({
        relationshipType,
        attestationVersion: CARE_ATTESTATION.version!,
        attestationAccepted: true,
        patient: validation.value,
      }, initialFlow);
      router.replace(initialFlow ? "/home" : `/my-health/circle/${result.patient.profileId}`);
    } catch (error) {
      const field = fieldForPhase3Error(error);
      if (field) setErrors({ [field]: error instanceof BeeexyApiError && error.status === 422 ? "Check this value and try again." : "This value could not be saved." });
      setMessage(phase3ErrorMessage(error, "create"));
    } finally {
      setPending(false);
    }
  }

  const content = (
    <div className={initialFlow ? "profile-gate-card add-patient-gate" : "page circle-page patient-editor-page"}>
      <Link className="back-link" href={initialFlow ? "/care-choice" : "/my-health/circle"}><Icon name="arrow-left" size={15} />Back</Link>
      <header className="patient-editor-heading">
        <span><Icon name="users" size={21} /></span>
        <div><p className="entry-eyebrow">My Circle</p><h1>Add to My Circle</h1><p>Create a separate patient profile for someone you care for.</p></div>
      </header>
      <form className="patient-form" onSubmit={submit} noValidate>
        {message && <div className="patient-form-alert" ref={alertRef} role="alert" tabIndex={-1}>{message}</div>}
        <label className="relationship-field">
          Relationship
          <select disabled={pending} required value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as RelationshipType)}>
            <option value="">Choose relationship</option>
            {RELATIONSHIP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <DemographicsFields disabled={pending} draft={draft} errors={errors} onChange={updateField} />
        <section className={`attestation-panel${attestationConfigured ? "" : " unavailable"}`} aria-labelledby="attestation-heading">
          <h2 id="attestation-heading">Confirmation</h2>
          {attestationConfigured ? (
            <label><input checked={attestationAccepted} disabled={pending} type="checkbox" onChange={(event) => setAttestationAccepted(event.target.checked)} /><span>{CARE_ATTESTATION.copy}</span></label>
          ) : (
            <p>Product-approved attestation copy and version have not been configured. No legal or identity verification is implied.</p>
          )}
        </section>
        <button className="button primary wide" disabled={pending || !attestationConfigured} type="submit">{pending ? "Adding…" : "Add to My Circle"}</button>
      </form>
    </div>
  );

  return initialFlow ? <main className="profile-gate-shell"><div className="profile-gate-top"><span className="brand-word">Beeexy<span>.</span></span></div>{content}</main> : <AppShell>{content}</AppShell>;
}
