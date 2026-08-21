"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BeeexyBrand } from "@/features/entry/beeexy-brand";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { DemographicsFields } from "./demographics-fields";
import { EMPTY_DEMOGRAPHICS, type DemographicsDraft, type FieldErrors, validateDemographics } from "./forms";
import { fieldForPhase3Error, PatientConcurrencyError, phase3ErrorMessage } from "./phase-3-errors";
import { usePatients } from "./patient-provider";

export function CompleteProfile() {
  const router = useRouter();
  const { completePrimaryProfile } = usePatients();
  const [draft, setDraft] = useState<DemographicsDraft>(EMPTY_DEMOGRAPHICS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) alertRef.current?.focus();
  }, [message]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validateDemographics(draft);
    setErrors(validation.errors);
    setMessage(validation.value ? "" : "Please review the highlighted fields.");
    if (!validation.value) return;
    setPending(true);
    try {
      await completePrimaryProfile(validation.value);
      router.replace("/care-choice");
    } catch (error) {
      if (error instanceof PatientConcurrencyError) {
        setDraft({
          firstName: error.latest.firstName || "",
          lastName: error.latest.lastName || "",
          dateOfBirth: error.latest.dateOfBirth || "",
          sexAssignedAtBirth: error.latest.sexAssignedAtBirth || "",
          state: error.latest.state || "",
        });
      }
      const field = fieldForPhase3Error(error);
      if (field) setErrors({ [field]: error instanceof BeeexyApiError && error.status === 422 ? "Check this value and try again." : "This value could not be saved." });
      setMessage(phase3ErrorMessage(error, "update"));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="profile-gate-shell">
      <div className="profile-gate-top"><BeeexyBrand compact /></div>
      <section className="profile-gate-card" aria-labelledby="complete-profile-heading">
        <p className="entry-eyebrow">One last step</p>
        <h1 id="complete-profile-heading">Complete your profile</h1>
        <p>Tell us the essentials we need to create your Beeexy patient profile.</p>
        <form onSubmit={submit} noValidate>
          {message && <div className="patient-form-alert" ref={alertRef} role="alert" tabIndex={-1}>{message}</div>}
          <DemographicsFields disabled={pending} draft={draft} errors={errors} onChange={(field, value) => {
            setDraft((current) => ({ ...current, [field]: value }));
            setErrors((current) => ({ ...current, [field]: undefined }));
          }} />
          <button className="entry-primary-button" disabled={pending} type="submit">{pending ? "Saving…" : "Continue"}</button>
        </form>
      </section>
    </main>
  );
}
