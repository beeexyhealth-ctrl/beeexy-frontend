"use client";

import { useId } from "react";
import { usePatients } from "./patient-provider";
import { displayPatientName } from "./patient-state";
import { RELATIONSHIP_LABELS } from "./constants";

export function PatientSwitcher() {
  const id = useId();
  const { activePatient, patients, selectActivePatient } = usePatients();
  if (!activePatient || !patients.length) return null;

  return (
    <div className="patient-switcher">
      <label htmlFor={id}>Caring for</label>
      <select
        id={id}
        value={activePatient.profileId}
        onChange={(event) => selectActivePatient(event.target.value)}
      >
        {patients.map((patient) => (
          <option key={patient.profileId} value={patient.profileId}>
            {displayPatientName(patient)} — {patient.accessType === "Primary" ? "You" : RELATIONSHIP_LABELS[patient.relationship!.type]}
          </option>
        ))}
      </select>
    </div>
  );
}
