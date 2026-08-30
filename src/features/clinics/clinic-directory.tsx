"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";
import {
  DEMO_LOCATIONS,
  demoLocationFromLabel,
  selectedDemoLocationLabel,
} from "@/features/directories/demo-presentation-catalog";
import { DirectoryDisclaimer, DirectoryError, DirectoryHeader, DirectorySkeleton } from "@/features/directories/directory-shared";
import type { ClinicQuery, ClinicSummary } from "@/lib/beeexy-api/contracts";
import { beeexyPhase7Api } from "@/lib/beeexy-api/phase-7-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";

const PAGE_SIZE = 20;
type ClinicCriteria = Omit<ClinicQuery, "cursor" | "pageSize">;
type SearchError = { kind: "cursor" | "validation" | "generic"; message: string };

const emptyCriteria: ClinicCriteria = { code: undefined, locality: undefined, administrativeArea: undefined, country: undefined };

export function ClinicDirectory() {
  const [criteria, setCriteria] = useState<ClinicCriteria>(emptyCriteria);
  const [draft, setDraft] = useState<ClinicCriteria>(emptyCriteria);
  const [items, setItems] = useState<ClinicSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);

  const requestPage = useCallback(async (nextCriteria: ClinicCriteria, cursor?: string, append = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestRef.current;
    abortRef.current = controller;
    try {
      const page = await beeexyPhase7Api.listClinics({ ...nextCriteria, pageSize: PAGE_SIZE, cursor }, controller.signal);
      if (controller.signal.aborted || requestId !== requestRef.current) return;
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
    } catch (reason) {
      if (controller.signal.aborted || requestId !== requestRef.current) return;
      const nextError = clinicSearchError(reason, Boolean(cursor));
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

  function startSearch(nextCriteria: ClinicCriteria) {
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

  const filtersActive = Object.values(criteria).some(Boolean);

  return (
    <FlowFrame className="phase-seven-frame">
      <main className="flow-shell phase-seven-directory">
        <DirectoryHeader active="clinics" />
        <section className="phase-seven-scroll">
          <div className="directory-intro">
            <span><Icon name="map-pin" size={21} /></span>
            <div><p className="directory-kicker">Clinic directory</p><h2>Clinics</h2><p>Browse the demo clinic directory or narrow it to a listed location.</p></div>
          </div>
          <ClinicFilterForm draft={draft} onChange={setDraft} onSubmit={applyFilters} onClear={clearFilters} hasFilters={filtersActive || Object.values(draft).some(Boolean)} />
          <DirectoryDisclaimer />
          <div className="directory-result-heading" aria-live="polite"><div><h2>{filtersActive ? "Matching clinics" : "All clinics"}</h2><p>{filtersActive ? "Based on the location you selected" : "Browse the available demo clinics"}</p></div></div>
          {loading && <DirectorySkeleton cards={2} />}
          {!loading && error && <DirectoryError message={error.message} retryLabel={error.kind === "cursor" ? "Restart search" : "Try again"} onRetry={() => startSearch(criteria)} />}
          {!loading && !error && items.length === 0 && <div className="phase-seven-state"><span><Icon name="map-pin" size={22} /></span><h2>{filtersActive ? "No clinics match these filters." : "No clinics are available."}</h2><p>{filtersActive ? "Try changing or clearing the location filter." : "Try loading the directory again shortly."}</p>{filtersActive && <button className="button secondary" type="button" onClick={clearFilters}>Clear filters</button>}</div>}
          {!loading && !error && items.length > 0 && <div className="phase-seven-list clinic-directory-list">{items.map((clinic) => <ClinicCard clinic={clinic} key={clinic.clinicId} />)}</div>}
          {!loading && !error && nextCursor && <button className="button secondary wide directory-load-more" type="button" disabled={loadingMore} aria-busy={loadingMore} onClick={loadMore}>{loadingMore ? "Loading more…" : "Load more clinics"}</button>}
        </section>
      </main>
    </FlowFrame>
  );
}

function ClinicFilterForm({ draft, hasFilters, onChange, onClear, onSubmit }: {
  draft: ClinicCriteria;
  hasFilters: boolean;
  onChange: (criteria: ClinicCriteria) => void;
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
    <form className="directory-filter-panel clinic-filter-panel" onSubmit={onSubmit}>
      <label className="clinic-location-filter">
        <span>Location</span>
        <span className="directory-select"><select value={selectedLocation} onChange={(event) => changeLocation(event.target.value)}><option value="">Any location</option>{DEMO_LOCATIONS.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}</select><Icon name="chevron-down" size={14} /></span>
      </label>
      <div className="directory-filter-actions"><button className="button primary" type="submit">Apply filter</button><button className="button quiet" type="button" disabled={!hasFilters} onClick={onClear}>Clear</button></div>
    </form>
  );
}

function ClinicCard({ clinic }: { clinic: ClinicSummary }) {
  return (
    <article className="phase-seven-card clinic-directory-card">
      <span className="directory-avatar clinic-avatar" aria-hidden="true"><Icon name="map-pin" size={19} /></span>
      <div><p className="directory-kicker">Demo clinic</p><h3>{clinic.name}</h3></div>
      <Link className="button secondary" href={`/clinics/${clinic.clinicId}`} aria-label={`View details for ${clinic.name}`}>View clinic details <Icon name="chevron-right" size={14} /></Link>
    </article>
  );
}

function clinicSearchError(reason: unknown, usedCursor: boolean): SearchError {
  if (reason instanceof BeeexyApiError && reason.status === 422) {
    if (usedCursor && reason.problem?.errorCode === "clinic_directory.cursor_invalid") return { kind: "cursor", message: "This result page can no longer be continued. Restart the same search from its first page." };
    return { kind: "validation", message: "We couldn’t use that location filter. Review your selection and try again." };
  }
  return { kind: "generic", message: "Check the connection and try again. No technical directory details were displayed." };
}
