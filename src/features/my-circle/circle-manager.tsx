"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { RELATIONSHIP_LABELS } from "./constants";
import { displayPatientName, initialsForPatient } from "./patient-state";
import { usePatients } from "./patient-provider";

export function CircleManager() {
  const { activePatient, clearUnavailableNotice, patients, refreshPatients, refreshRelationships, relationships, unavailableNotice } = usePatients();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([refreshPatients(), refreshRelationships()])
      .catch(() => setError("We couldn’t refresh My Circle. Please try again."))
      .finally(() => setLoading(false));
  }, [refreshPatients, refreshRelationships]);

  const revoked = relationships.filter((relationship) => relationship.status === "Revoked");

  return (
    <>
      {(unavailableNotice || error) && (
        <div className="circle-notice" role="status">
          <span>{unavailableNotice || error}</span>
          <button type="button" onClick={() => { clearUnavailableNotice(); setError(""); }}>Dismiss</button>
        </div>
      )}
      <div className="circle-status-row">
        <p>{patients.length} {patients.length === 1 ? "profile" : "profiles"}</p>
        {loading && <span role="status">Refreshing…</span>}
      </div>
      <div className="circle-members phase-three-circle" aria-busy={loading}>
        {patients.map((patient) => (
          <Link className={patient.profileId === activePatient?.profileId ? "active" : ""} href={`/my-health/circle/${patient.profileId}`} key={patient.profileId}>
            <span className="circle-avatar">{initialsForPatient(patient)}</span>
            <span className="circle-member-copy">
              <strong>{displayPatientName(patient)}</strong>
              <small>{patient.accessType === "Primary" ? "You" : RELATIONSHIP_LABELS[patient.relationship!.type]}</small>
            </span>
            {patient.profileId === activePatient?.profileId && <span className="active-context">Active</span>}
            <Icon name="chevron-right" size={16} />
          </Link>
        ))}
      </div>
      <Link className="button primary wide circle-add" href="/my-health/circle/add"><Icon name="plus" size={16} />Add person</Link>
      {revoked.length > 0 && (
        <section className="circle-history" aria-labelledby="circle-history-heading">
          <h2 id="circle-history-heading">Relationship history</h2>
          <p>Removed profiles remain in history but are not available for care.</p>
          <div>
            {revoked.map((relationship) => (
              <article key={relationship.id}>
                <span>{initialsForPatient(relationship.subject)}</span>
                <div><strong>{displayPatientName(relationship.subject)}</strong><small>{RELATIONSHIP_LABELS[relationship.type]} · Removed</small></div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
