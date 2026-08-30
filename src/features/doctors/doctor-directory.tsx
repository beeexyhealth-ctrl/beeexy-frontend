"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";
import {
  DEMO_INSURANCE_PLANS,
  DEMO_LANGUAGES,
  DEMO_LOCATIONS,
  DEMO_SPECIALTIES,
  demoCatalogLabel,
  demoLocationFromLabel,
  demoLocationLabel,
  selectedDemoLocationLabel,
} from "@/features/directories/demo-presentation-catalog";
import { DirectoryDisclaimer, DirectoryError, DirectoryHeader, DirectorySkeleton } from "@/features/directories/directory-shared";
import type { DoctorMatchFactor, DoctorQuery, DoctorSearchItem } from "@/lib/beeexy-api/contracts";
import { beeexyPhase7Api } from "@/lib/beeexy-api/phase-7-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";

const PAGE_SIZE = 20;
type DoctorCriteria = Omit<DoctorQuery, "cursor" | "pageSize">;
type SearchError = { kind: "cursor" | "validation" | "generic"; message: string };
type DemoSelectOption = { label: string; value: string };

const emptyCriteria: DoctorCriteria = {
  specialtyCode: undefined,
  languageCode: undefined,
  locality: undefined,
  administrativeArea: undefined,
  country: undefined,
  insurancePlanCode: undefined,
};

export function DoctorDirectory() {
  const [criteria, setCriteria] = useState<DoctorCriteria>(emptyCriteria);
  const [draft, setDraft] = useState<DoctorCriteria>(emptyCriteria);
  const [items, setItems] = useState<DoctorSearchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);

  const requestPage = useCallback(async (nextCriteria: DoctorCriteria, cursor?: string, append = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestRef.current;
    abortRef.current = controller;
    try {
      const page = await beeexyPhase7Api.searchDoctors({ ...nextCriteria, pageSize: PAGE_SIZE, cursor }, controller.signal);
      if (controller.signal.aborted || requestId !== requestRef.current) return;
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
    } catch (reason) {
      if (controller.signal.aborted || requestId !== requestRef.current) return;
      const nextError = doctorSearchError(reason, Boolean(cursor));
      if (nextError.kind === "cursor") {
        setItems([]);
        setNextCursor(null);
      }
      setError(nextError);
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void requestPage(emptyCriteria));
    return () => {
      cancelAnimationFrame(frame);
      abortRef.current?.abort();
    };
  }, [requestPage]);

  function startSearch(nextCriteria: DoctorCriteria) {
    setError(null);
    setLoading(true);
    setItems([]);
    setNextCursor(null);
    void requestPage(nextCriteria);
  }

  function loadMore() {
    if (!nextCursor) return;
    setError(null);
    setLoadingMore(true);
    void requestPage(criteria, nextCursor, true);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCriteria(draft);
    startSearch(draft);
  }

  function clearFilters() {
    setDraft(emptyCriteria);
    setCriteria(emptyCriteria);
    startSearch(emptyCriteria);
  }

  const matchingActive = Object.values(criteria).some(Boolean);

  return (
    <FlowFrame className="phase-seven-frame">
      <main className="flow-shell phase-seven-directory">
        <DirectoryHeader active="doctors" />
        <section className="phase-seven-scroll">
          <div className="directory-intro">
            <span><Icon name="stethoscope" size={21} /></span>
            <div><p className="directory-kicker">Doctor directory</p><h2>Find a doctor</h2><p>Browse the demo directory by specialty, language, insurance, or location.</p></div>
          </div>
          <DoctorFilterForm draft={draft} onChange={setDraft} onSubmit={applyFilters} onClear={clearFilters} hasFilters={Object.values(draft).some(Boolean)} />
          <DirectoryDisclaimer />
          <div className="directory-result-heading" aria-live="polite">
            <div><h2>{matchingActive ? "Your matches" : "All doctors"}</h2><p>{matchingActive ? "Based on the filters you selected" : "Browse the available demo profiles"}</p></div>
          </div>

          {loading && <DirectorySkeleton />}
          {!loading && error && <DirectoryError message={error.message} retryLabel={error.kind === "cursor" ? "Restart search" : "Try again"} onRetry={() => startSearch(criteria)} />}
          {!loading && !error && items.length === 0 && <div className="phase-seven-state"><span><Icon name="search" size={22} /></span><h2>{matchingActive ? "No doctors match these filters." : "No doctors are available."}</h2><p>{matchingActive ? "Try changing or clearing a filter." : "Try loading the directory again shortly."}</p>{matchingActive && <button className="button secondary" type="button" onClick={clearFilters}>Clear filters</button>}</div>}
          {!loading && !error && items.length > 0 && <div className="phase-seven-list">{items.map((doctor) => <DoctorCard doctor={doctor} key={doctor.doctorId} />)}</div>}
          {!loading && !error && nextCursor && <button className="button secondary wide directory-load-more" type="button" disabled={loadingMore} aria-busy={loadingMore} onClick={loadMore}>{loadingMore ? "Loading more…" : "Load more doctors"}</button>}
        </section>
      </main>
    </FlowFrame>
  );
}

function DoctorFilterForm({ draft, hasFilters, onChange, onClear, onSubmit }: {
  draft: DoctorCriteria;
  hasFilters: boolean;
  onChange: (criteria: DoctorCriteria) => void;
  onClear: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const selectedLocation = selectedDemoLocationLabel(draft);

  function changeLocation(label: string) {
    const location = demoLocationFromLabel(label);
    onChange({
      ...draft,
      locality: location?.locality,
      administrativeArea: location?.administrativeArea,
      country: location?.country,
    });
  }

  return (
    <form className="directory-filter-panel" onSubmit={onSubmit}>
      <div className="specialty-browser" role="group" aria-labelledby="specialty-browser-heading">
        <p className="specialty-browser-heading" id="specialty-browser-heading">Browse by specialty</p>
        <div className="specialty-chip-list">
          <button type="button" className={!draft.specialtyCode ? "selected" : ""} aria-pressed={!draft.specialtyCode} onClick={() => onChange({ ...draft, specialtyCode: undefined })}>All specialties</button>
          {DEMO_SPECIALTIES.map((option) => <button type="button" key={option.value} className={draft.specialtyCode === option.value ? "selected" : ""} aria-pressed={draft.specialtyCode === option.value} onClick={() => onChange({ ...draft, specialtyCode: option.value })}><Icon name="stethoscope" size={14} />{option.label}</button>)}
        </div>
      </div>
      <details className="directory-filters" open>
        <summary><span><Icon name="search" size={16} />Filters</span><Icon name="chevron-down" size={16} /></summary>
        <div className="directory-filter-body">
          <div className="directory-filter-grid">
            <FilterSelect label="Language" value={draft.languageCode ?? ""} options={DEMO_LANGUAGES} placeholder="Any language" onChange={(value) => onChange({ ...draft, languageCode: value || undefined })} />
            <FilterSelect label="Insurance" value={draft.insurancePlanCode ?? ""} options={DEMO_INSURANCE_PLANS} placeholder="Any listed plan" onChange={(value) => onChange({ ...draft, insurancePlanCode: value || undefined })} />
            <FilterSelect label="Location" value={selectedLocation} options={DEMO_LOCATIONS.map(({ label }) => ({ label, value: label }))} placeholder="Any location" onChange={changeLocation} />
          </div>
          <div className="directory-filter-actions"><button className="button primary" type="submit">Apply filters</button><button className="button quiet" type="button" disabled={!hasFilters} onClick={onClear}>Clear</button></div>
        </div>
      </details>
    </form>
  );
}

function FilterSelect({ label, onChange, options, placeholder, value }: {
  label: string;
  onChange: (value: string) => void;
  options: readonly DemoSelectOption[];
  placeholder: string;
  value: string;
}) {
  return <label><span>{label}</span><span className="directory-select"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><Icon name="chevron-down" size={14} /></span></label>;
}

function DoctorCard({ doctor }: { doctor: DoctorSearchItem }) {
  const firstAffiliation = doctor.affiliations[0];
  const specialties = doctor.specialties.map((item) => demoCatalogLabel(item.code, item.name));
  const languages = doctor.languages.map((item) => demoCatalogLabel(item.code, item.name));
  const insurance = doctor.storedInsuranceParticipations.map((item) => demoCatalogLabel(item.code, item.name));

  return (
    <article className="phase-seven-card doctor-directory-card">
      <div className="phase-seven-card-head"><span className="directory-avatar" aria-hidden="true">{initials(doctor.displayName)}</span><div><h3>{doctor.displayName}</h3><p>{specialties.join(" · ") || "Specialty not listed"}</p></div>{doctor.match && <span className="backend-match-score"><small>Match score</small><strong>{doctor.match.matchScore} / 100</strong></span>}</div>
      <div className="doctor-directory-meta">
        {languages.length > 0 && <p><Icon name="message" size={14} /><span><strong>Languages</strong>{languages.join(" · ")}</span></p>}
        {firstAffiliation && <p><Icon name="map-pin" size={14} /><span><strong>{demoLocationLabel(firstAffiliation.location, firstAffiliation.clinicName)}</strong>{firstAffiliation.clinicName}</span></p>}
      </div>
      {doctor.match && <MatchFactors factors={doctor.match.factors} />}
      {insurance.length > 0 && <div className="directory-data-block"><strong>Insurance listed</strong><p>{insurance.join(" · ")}</p><small>Demo directory participation only</small></div>}
      <Link className="button secondary wide" href={`/doctors/${doctor.doctorId}`}>View doctor details <Icon name="chevron-right" size={14} /></Link>
    </article>
  );
}

function MatchFactors({ factors }: { factors: DoctorMatchFactor[] }) {
  const visibleFactors = factors.filter((factor) => factor.state !== "not_applicable");
  if (visibleFactors.length === 0) return null;

  return <div className="match-factor-block"><strong>Why this result matches</strong><ul>{visibleFactors.map((factor) => <li key={factor.factorCode} className={factor.state}><Icon name={factor.state === "matched" ? "check" : "info"} size={13} /><span><strong>{factorLabel(factor)}</strong><small>{factorFriendlyValue(factor)}</small></span></li>)}</ul></div>;
}

function doctorSearchError(reason: unknown, usedCursor: boolean): SearchError {
  if (reason instanceof BeeexyApiError && reason.status === 422) {
    const code = reason.problem?.errorCode;
    if (usedCursor && code === "doctor_directory.cursor_invalid") return { kind: "cursor", message: "This result page can no longer be continued. Restart the same search from its first page." };
    return { kind: "validation", message: "We couldn’t use those filters. Review your selections and try again." };
  }
  return { kind: "generic", message: "Check the connection and try again. No technical directory details were displayed." };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function factorLabel(factor: DoctorMatchFactor) {
  return { specialty_exact: "Specialty", language_exact: "Language", location_exact: "Location", stored_insurance_participation_exact: "Insurance" }[factor.factorCode];
}

function factorFriendlyValue(factor: DoctorMatchFactor) {
  if (factor.state === "not_matched") return "Not matched";
  const values = Object.fromEntries(factor.explanationData.map((item) => [item.key, item.value]));
  const selectedValue = factor.explanationData[0]?.value;
  if (!selectedValue) return "Matches your selection";

  if (factor.factorCode === "location_exact") return demoLocationLabel(values, values.locality ?? "Matches your location");
  const label = demoCatalogLabel(selectedValue);
  return label === selectedValue && selectedValue.startsWith("demo-") ? "Matches your selection" : label;
}
