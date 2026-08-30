"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";
import { demoLocationLabel } from "@/features/directories/demo-presentation-catalog";
import { DirectoryDetailTabs, DirectoryDisclaimer, DirectorySkeleton } from "@/features/directories/directory-shared";
import type { ClinicDetail as ClinicDetailContract, ClinicLocation } from "@/lib/beeexy-api/contracts";
import { beeexyPhase7Api } from "@/lib/beeexy-api/phase-7-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";

type DetailState = { status: "loading" } | { status: "ready"; clinic: ClinicDetailContract } | { status: "unavailable" } | { status: "error" };

const CLINIC_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "locations", label: "Locations" },
] as const;

type ClinicDetailTab = (typeof CLINIC_DETAIL_TABS)[number]["id"];

export function ClinicDetail({ clinicId }: { clinicId: string }) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);
  const requestClinic = useCallback((signal?: AbortSignal) => {
    return beeexyPhase7Api.getClinic(clinicId, signal).then((clinic) => setState({ status: "ready", clinic })).catch((reason) => {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setState(reason instanceof BeeexyApiError && reason.status === 404 ? { status: "unavailable" } : { status: "error" });
    });
  }, [clinicId]);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    void requestClinic(controller.signal);
    return () => abortRef.current?.abort();
  }, [requestClinic]);

  function retry() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    void requestClinic(controller.signal);
  }

  return (
    <FlowFrame className="phase-seven-frame phase-seven-detail-frame">
      <main className="flow-shell phase-seven-detail">
        <header className="phase-seven-detail-header"><Link href="/clinics" className="icon-button" aria-label="Back to clinic directory"><Icon name="arrow-left" size={18} /></Link><div><p>Demo care directory</p><h1>Clinic details</h1></div></header>
        <section className="phase-seven-detail-scroll">
          {state.status === "loading" && <DirectorySkeleton cards={2} />}
          {state.status === "unavailable" && <DetailState icon="map-pin" title="This clinic is unavailable." message="The directory cannot distinguish a missing clinic from one that is not public." />}
          {state.status === "error" && <DetailState icon="info" title="We couldn’t load this clinic." message="Check the connection and try again." action={retry} />}
          {state.status === "ready" && <ClinicContent clinic={state.clinic} />}
        </section>
      </main>
    </FlowFrame>
  );
}

function ClinicContent({ clinic }: { clinic: ClinicDetailContract }) {
  const [activeTab, setActiveTab] = useState<ClinicDetailTab>("overview");
  const primaryLocation = clinic.locations[0];

  return (
    <div className="detail-profile clinic-detail-profile">
      <section className="detail-profile-hero clinic-detail-hero" aria-labelledby="clinic-profile-name">
        <span className="detail-profile-avatar clinic" aria-hidden="true"><Icon name="map-pin" size={25} /></span>
        <div className="detail-profile-copy">
          <p className="detail-profile-kicker">Clinic profile</p>
          <h2 id="clinic-profile-name">{clinic.name}</h2>
          <p className="detail-profile-primary">{demoLocationLabel(primaryLocation, "Location not listed")}</p>
          <div className="detail-profile-meta"><span><Icon name="map-pin" size={13} />{clinic.locations.length} {clinic.locations.length === 1 ? "location" : "locations"} listed</span>{primaryLocation && <span><Icon name="clock" size={13} />{primaryLocation.timeZone}</span>}</div>
        </div>
      </section>

      <DirectoryDisclaimer compact />
      <DirectoryDetailTabs activeTab={activeTab} idPrefix="clinic-detail" label="Clinic detail sections" onChange={setActiveTab} tabs={CLINIC_DETAIL_TABS} />

      <div className="detail-tab-panel" id={`clinic-detail-panel-${activeTab}`} role="tabpanel" aria-labelledby={`clinic-detail-tab-${activeTab}`} tabIndex={0}>
        {activeTab === "overview" && (
          <section className="detail-flat-section">
            <div className="detail-section-heading"><span aria-hidden="true"><Icon name="document" size={16} /></span><div><h3>Clinic overview</h3><p>Public demo directory information</p></div></div>
            <dl className="detail-summary-list">
              <div><dt>Locations listed</dt><dd>{clinic.locations.length}</dd></div>
              <div><dt>Primary location</dt><dd>{demoLocationLabel(primaryLocation, "Not listed")}</dd></div>
              {primaryLocation && <div><dt>Time zone</dt><dd>{primaryLocation.timeZone}</dd></div>}
            </dl>
          </section>
        )}

        {activeTab === "locations" && (
          <section className="detail-flat-section">
            <div className="detail-section-heading"><span aria-hidden="true"><Icon name="map-pin" size={16} /></span><div><h3>Locations</h3><p>{clinic.locations.length} {clinic.locations.length === 1 ? "location" : "locations"} listed</p></div></div>
            {clinic.locations.length ? <ClinicLocationList locations={clinic.locations} /> : <p className="detail-empty-copy">No locations are listed for this clinic.</p>}
          </section>
        )}
      </div>
    </div>
  );
}

function ClinicLocationList({ locations }: { locations: ClinicLocation[] }) {
  return (
    <div className="detail-row-list">
      {locations.map((location) => (
        <article className="detail-location-row" key={location.locationId}>
          <span className="detail-row-icon" aria-hidden="true"><Icon name="map-pin" size={17} /></span>
          <div>
            <p className="detail-row-eyebrow">Clinic location</p>
            <h4>{location.name}</h4>
            <p>{location.locality}</p>
            <p>{location.administrativeArea} · {location.country}</p>
            <span className="detail-row-meta">Time zone · {location.timeZone}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function DetailState({ action, icon, message, title }: { action?: () => void; icon: "info" | "map-pin"; message: string; title: string }) {
  return <div className="phase-seven-state"><span><Icon name={icon} size={22} /></span><h2>{title}</h2><p>{message}</p>{action && <button className="button secondary" type="button" onClick={action}>Try again</button>}<Link className="button quiet" href="/clinics">Back to clinics</Link></div>;
}
