"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import type { PatientDetail as PatientDetailContract } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { RELATIONSHIP_LABELS, STATE_NAMES } from "./constants";
import { phase3ErrorMessage } from "./phase-3-errors";
import { usePatients } from "./patient-provider";
import { displayPatientName, initialsForPatient } from "./patient-state";

export function PatientDetail({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { details, getPatient, patients, revokeRelationship, selectActivePatient } = usePatients();
  const [detail, setDetail] = useState<PatientDetailContract | null>(details[patientId] ?? null);
  const [loading, setLoading] = useState(!details[patientId]);
  const [pendingRevoke, setPendingRevoke] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const entry = patients.find((patient) => patient.profileId === patientId);

  useEffect(() => {
    let active = true;
    getPatient(patientId)
      .then((patient) => { if (active) setDetail(patient); })
      .catch((error) => {
        if (!active) return;
        if (error instanceof BeeexyApiError && error.status === 404) router.replace("/my-health/circle");
        else setMessage(phase3ErrorMessage(error, "load"));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [getPatient, patientId, router]);

  useEffect(() => {
    if (!confirming) return;
    cancelRef.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setConfirming(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirming]);

  async function revoke() {
    if (!entry?.relationship) return;
    setPendingRevoke(true);
    setMessage("");
    try {
      await revokeRelationship(entry.relationship.relationshipId, patientId);
      router.replace("/my-health/circle");
    } catch (error) {
      setMessage(phase3ErrorMessage(error, "revoke"));
      setConfirming(false);
    } finally {
      setPendingRevoke(false);
    }
  }

  return (
    <AppShell>
      <div className="page circle-page patient-detail-page">
        <Link className="back-link" href="/my-health/circle"><Icon name="arrow-left" size={15} />My Circle</Link>
        {loading && !detail ? <PatientDetailLoading /> : detail ? (
          <>
            <header className="patient-detail-hero">
              <span>{initialsForPatient(detail)}</span>
              <div><h1>{displayPatientName(detail)}</h1><p>{entry?.accessType === "Primary" ? "You" : entry?.relationship ? RELATIONSHIP_LABELS[entry.relationship.type] : "Patient profile"}</p></div>
            </header>
            {message && <div className="patient-form-alert" role="alert">{message}</div>}
            <dl className="patient-detail-list">
              <DetailRow label="First name" value={detail.firstName} />
              <DetailRow label="Last name" value={detail.lastName} />
              <DetailRow label="Date of birth" value={detail.dateOfBirth ? formatDate(detail.dateOfBirth) : null} />
              <DetailRow label="Sex assigned at birth" value={detail.sexAssignedAtBirth} />
              <DetailRow label="State" value={detail.state ? `${STATE_NAMES[detail.state] || detail.state} (${detail.state})` : null} />
              <DetailRow label="Beeexy ID" value={detail.beeexyId} />
            </dl>
            <div className="patient-detail-actions">
              <Link className="button primary" href={`/my-health/circle/${patientId}/edit`}>Edit profile</Link>
              <button className="button secondary" type="button" onClick={() => selectActivePatient(patientId)}>Care for this person</button>
            </div>
            {entry?.accessType === "Managed" && <button className="button danger wide patient-remove" type="button" onClick={() => setConfirming(true)}>Remove from My Circle</button>}
          </>
        ) : (
          <div className="circle-empty"><span><Icon name="users" size={24} /></span><h2>Profile unavailable</h2><p>{message || "This profile could not be loaded."}</p></div>
        )}
      </div>
      {confirming && detail && (
        <div className="patient-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirming(false); }}>
          <section aria-labelledby="remove-patient-heading" aria-modal="true" className="patient-dialog" role="dialog">
            <span><Icon name="users" size={22} /></span>
            <h2 id="remove-patient-heading">Remove {detail.firstName || "this person"} from My Circle?</h2>
            <p>You will no longer be able to manage this profile. The patient’s profile and information will not be deleted.</p>
            <div><button className="button secondary" disabled={pendingRevoke} ref={cancelRef} type="button" onClick={() => setConfirming(false)}>Cancel</button><button className="button danger" disabled={pendingRevoke} type="button" onClick={() => void revoke()}>{pendingRevoke ? "Removing…" : "Remove"}</button></div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return <div><dt>{label}</dt><dd className={value ? "" : "empty"}>{value || "Not provided"}</dd></div>;
}

function PatientDetailLoading() {
  return <div className="patient-detail-loading" aria-label="Loading patient profile" role="status"><span /><span /><span /><span /></div>;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}
