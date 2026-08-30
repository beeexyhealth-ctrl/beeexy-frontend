"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";
import { demoCatalogLabel, demoLocationLabel } from "@/features/directories/demo-presentation-catalog";
import { DirectoryDetailTabs, DirectoryDisclaimer, DirectorySkeleton } from "@/features/directories/directory-shared";
import type { DoctorAffiliation, DoctorDetail as DoctorDetailContract } from "@/lib/beeexy-api/contracts";
import { beeexyPhase7Api } from "@/lib/beeexy-api/phase-7-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; doctor: DoctorDetailContract }
  | { status: "unavailable" }
  | { status: "error" };

const DOCTOR_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "insurance", label: "Insurance" },
  { id: "locations", label: "Locations" },
  { id: "credentials", label: "Credentials" },
] as const;

type DoctorDetailTab = (typeof DOCTOR_DETAIL_TABS)[number]["id"];

export function DoctorProfile({ doctorId }: { doctorId: string }) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);
  const requestDoctor = useCallback((signal?: AbortSignal) => {
    return beeexyPhase7Api.getDoctor(doctorId, signal).then((doctor) => setState({ status: "ready", doctor })).catch((reason) => {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setState(reason instanceof BeeexyApiError && reason.status === 404 ? { status: "unavailable" } : { status: "error" });
    });
  }, [doctorId]);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    void requestDoctor(controller.signal);
    return () => abortRef.current?.abort();
  }, [requestDoctor]);

  function retry() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    void requestDoctor(controller.signal);
  }

  return (
    <FlowFrame className="phase-seven-frame phase-seven-detail-frame">
      <main className="flow-shell phase-seven-detail">
        <header className="phase-seven-detail-header"><Link href="/doctors" className="icon-button" aria-label="Back to doctor directory"><Icon name="arrow-left" size={18} /></Link><div><p>Demo care directory</p><h1>Doctor details</h1></div></header>
        <section className="phase-seven-detail-scroll">
          {state.status === "loading" && <DirectorySkeleton cards={3} />}
          {state.status === "unavailable" && <DetailStateView icon="stethoscope" title="This doctor is unavailable." message="The directory cannot distinguish a missing doctor from one that is not public." />}
          {state.status === "error" && <DetailStateView icon="info" title="We couldn’t load this doctor." message="Check the connection and try again." action={retry} />}
          {state.status === "ready" && <DoctorContent doctor={state.doctor} />}
        </section>
      </main>
    </FlowFrame>
  );
}

function DoctorContent({ doctor }: { doctor: DoctorDetailContract }) {
  const [activeTab, setActiveTab] = useState<DoctorDetailTab>("overview");
  const specialties = doctor.specialties.map((item) => demoCatalogLabel(item.code, item.name));
  const languages = doctor.languages.map((item) => demoCatalogLabel(item.code, item.name));
  const insurance = doctor.storedInsuranceParticipations.map((item) => demoCatalogLabel(item.code, item.name));
  const primaryAffiliation = doctor.affiliations[0];
  const primaryLocation = primaryAffiliation?.location;

  return (
    <div className="detail-profile">
      <section className="detail-profile-hero doctor-detail-hero" aria-labelledby="doctor-profile-name">
        <span className="detail-profile-avatar" aria-hidden="true">{initials(doctor.displayName)}</span>
        <div className="detail-profile-copy">
          <p className="detail-profile-kicker">Doctor profile</p>
          <h2 id="doctor-profile-name">{doctor.displayName}</h2>
          <p className="detail-profile-primary">{specialties[0] ?? "Specialty not listed"}</p>
          <div className="detail-profile-meta">
            {primaryAffiliation && <span><Icon name="map-pin" size={13} />{demoLocationLabel(primaryLocation, primaryAffiliation.clinicName)}</span>}
            {languages.length > 0 && <span><Icon name="message" size={13} />{languages.length} {languages.length === 1 ? "language" : "languages"} listed</span>}
          </div>
        </div>
      </section>

      <DirectoryDisclaimer compact />
      <DirectoryDetailTabs activeTab={activeTab} idPrefix="doctor-detail" label="Doctor detail sections" onChange={setActiveTab} tabs={DOCTOR_DETAIL_TABS} />

      <div className="detail-tab-panel" id={`doctor-detail-panel-${activeTab}`} role="tabpanel" aria-labelledby={`doctor-detail-tab-${activeTab}`} tabIndex={0}>
        {activeTab === "overview" && (
          <div className="detail-tab-stack">
            <DetailSection icon="stethoscope" title="Specialties" detail="Care areas in this demo directory">
              {specialties.length ? <TagList items={specialties} tone="specialty" /> : <p className="detail-empty-copy">No specialties are listed.</p>}
            </DetailSection>
            <DetailSection icon="message" title="Languages" detail="Communication languages">
              {languages.length ? <TagList items={languages} tone="language" /> : <p className="detail-empty-copy">No languages are listed.</p>}
            </DetailSection>
            <DetailSection icon="map-pin" title="Primary clinic" detail="Primary public affiliation">
              {primaryAffiliation ? <AffiliationList affiliations={[primaryAffiliation]} /> : <p className="detail-empty-copy">No public clinic affiliations are listed.</p>}
            </DetailSection>
          </div>
        )}

        {activeTab === "insurance" && (
          <DetailSection icon="shield" title="Insurance listed" detail="Stored demo directory participation">
            {insurance.length ? <TagList items={insurance} tone="insurance" /> : <p className="detail-empty-copy">No insurance participation is listed.</p>}
            <DetailContextNote>This is stored demo participation, not live eligibility, coverage, benefits, or network verification.</DetailContextNote>
          </DetailSection>
        )}

        {activeTab === "locations" && (
          <DetailSection icon="map-pin" title="Clinics and locations" detail={`${doctor.affiliations.length} ${doctor.affiliations.length === 1 ? "affiliation" : "affiliations"} listed`}>
            {doctor.affiliations.length ? <AffiliationList affiliations={doctor.affiliations} /> : <p className="detail-empty-copy">No public clinic affiliations are listed.</p>}
          </DetailSection>
        )}

        {activeTab === "credentials" && (
          <DetailSection icon="document" title="Credential information" detail="Public demo dataset information">
            {doctor.credentials.length ? <ul className="detail-credential-list">{doctor.credentials.map((credential) => <li key={credential.name}><span aria-hidden="true"><Icon name="document" size={15} /></span><p>{credential.name}</p></li>)}</ul> : <p className="detail-empty-copy">No public demo credentials are listed.</p>}
            <DetailContextNote>These names come from the synthetic dataset and are not external professional verification.</DetailContextNote>
          </DetailSection>
        )}
      </div>
    </div>
  );
}

function DetailSection({ children, detail, icon, title }: { children: ReactNode; detail: string; icon: "document" | "map-pin" | "message" | "shield" | "stethoscope"; title: string }) {
  return <section className="detail-flat-section"><div className="detail-section-heading"><span aria-hidden="true"><Icon name={icon} size={16} /></span><div><h3>{title}</h3><p>{detail}</p></div></div>{children}</section>;
}

function TagList({ items, tone }: { items: string[]; tone: "insurance" | "language" | "specialty" }) {
  return <ul className={`detail-tag-list ${tone}`} aria-label={`${tone} labels`}>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>;
}

function AffiliationList({ affiliations }: { affiliations: DoctorAffiliation[] }) {
  return (
    <div className="detail-row-list">
      {affiliations.map((affiliation) => (
        <article className="detail-location-row" key={`${affiliation.clinicId}-${affiliation.location?.locationId || "clinic"}`}>
          <span className="detail-row-icon" aria-hidden="true"><Icon name="map-pin" size={17} /></span>
          <div>
            <p className="detail-row-eyebrow">{demoLocationLabel(affiliation.location, "Clinic affiliation")}</p>
            <h4>{affiliation.clinicName}</h4>
            {affiliation.location ? <><p>{affiliation.location.name}</p><p>{affiliation.location.administrativeArea} · {affiliation.location.country}</p><span className="detail-row-meta">Time zone · {affiliation.location.timeZone}</span></> : <p>No specific location listed</p>}
            <Link className="detail-row-link" href={`/clinics/${affiliation.clinicId}`}>View clinic details <Icon name="chevron-right" size={13} /></Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function DetailContextNote({ children }: { children: ReactNode }) {
  return <p className="detail-context-note"><Icon name="info" size={14} />{children}</p>;
}

function DetailStateView({ action, icon, message, title }: { action?: () => void; icon: "info" | "stethoscope"; message: string; title: string }) {
  return <div className="phase-seven-state"><span><Icon name={icon} size={22} /></span><h2>{title}</h2><p>{message}</p>{action && <button className="button secondary" type="button" onClick={action}>Try again</button>}<Link className="button quiet" href="/doctors">Back to doctors</Link></div>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
