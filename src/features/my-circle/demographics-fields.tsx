"use client";

import { useId } from "react";
import { SEX_OPTIONS, US_STATES } from "./constants";
import type { DemographicField, DemographicsDraft, FieldErrors } from "./forms";

type Props = {
  disabled?: boolean;
  draft: DemographicsDraft;
  errors: FieldErrors;
  onChange(field: DemographicField, value: string): void;
};

export function DemographicsFields({ disabled = false, draft, errors, onChange }: Props) {
  const prefix = useId();
  const fieldProps = (field: DemographicField) => ({
    "aria-describedby": errors[field] ? `${prefix}-${field}-error` : undefined,
    "aria-invalid": errors[field] ? true as const : undefined,
    disabled,
    id: `${prefix}-${field}`,
  });

  return (
    <div className="patient-form-grid">
      <label htmlFor={`${prefix}-firstName`}>
        First name
        <input {...fieldProps("firstName")} autoComplete="given-name" maxLength={100} value={draft.firstName} onChange={(event) => onChange("firstName", event.target.value)} />
        <FieldError id={`${prefix}-firstName-error`} message={errors.firstName} />
      </label>
      <label htmlFor={`${prefix}-lastName`}>
        Last name
        <input {...fieldProps("lastName")} autoComplete="family-name" maxLength={100} value={draft.lastName} onChange={(event) => onChange("lastName", event.target.value)} />
        <FieldError id={`${prefix}-lastName-error`} message={errors.lastName} />
      </label>
      <label htmlFor={`${prefix}-dateOfBirth`}>
        Date of birth
        <input {...fieldProps("dateOfBirth")} max={new Date().toISOString().slice(0, 10)} type="date" value={draft.dateOfBirth} onChange={(event) => onChange("dateOfBirth", event.target.value)} />
        <FieldError id={`${prefix}-dateOfBirth-error`} message={errors.dateOfBirth} />
      </label>
      <fieldset className="patient-sex-field" disabled={disabled} aria-describedby={errors.sexAssignedAtBirth ? `${prefix}-sexAssignedAtBirth-error` : undefined}>
        <legend>Sex assigned at birth</legend>
        <div>
          {SEX_OPTIONS.map((option) => (
            <label className={draft.sexAssignedAtBirth === option.value ? "selected" : ""} key={option.value}>
              <input checked={draft.sexAssignedAtBirth === option.value} name={`${prefix}-sex`} type="radio" value={option.value} onChange={() => onChange("sexAssignedAtBirth", option.value)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <FieldError id={`${prefix}-sexAssignedAtBirth-error`} message={errors.sexAssignedAtBirth} />
      </fieldset>
      <label className="patient-state-field" htmlFor={`${prefix}-state`}>
        State
        <select {...fieldProps("state")} autoComplete="address-level1" value={draft.state} onChange={(event) => onChange("state", event.target.value)}>
          <option value="">Choose a state</option>
          {US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <FieldError id={`${prefix}-state-error`} message={errors.state} />
      </label>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <span className="field-error" id={id}>{message}</span> : null;
}
