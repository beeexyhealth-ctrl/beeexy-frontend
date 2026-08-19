"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";
import type { Doctor } from "@/types/domain";

type MatchScreen = "urgency" | "modality" | "insurance" | "loading" | "list";

export function DoctorDirectory({ doctors, initialMatch = false }: { doctors: Doctor[]; initialMatch?: boolean }) {
  const [screen, setScreen] = useState<MatchScreen>(initialMatch ? "urgency" : "list");
  const [urgency, setUrgency] = useState("");
  const [modality, setModality] = useState("No preference");
  const [insurance, setInsurance] = useState("");
  const [specialty, setSpecialty] = useState("All");
  const [language, setLanguage] = useState("All");

  useEffect(() => {
    if (screen !== "loading") return;
    const timer = window.setTimeout(() => setScreen("list"), 1_150);
    return () => window.clearTimeout(timer);
  }, [screen]);

  const specialties = ["All", ...new Set(doctors.map((doctor) => doctor.specialty))];
  const languages = ["All", ...new Set(doctors.flatMap((doctor) => doctor.languages))];
  const filtered = useMemo(() => doctors.filter((doctor) => {
    const specialtyMatch = specialty === "All" || doctor.specialty === specialty;
    const languageMatch = language === "All" || doctor.languages.includes(language);
    const modalityMatch = modality === "No preference" || modality === "In person" || doctor.videoVisit;
    const insuranceMatch = !insurance || insurance === "Self pay" || doctor.insurances.some((item) => item.toLowerCase().includes(insurance.toLowerCase()));
    return specialtyMatch && languageMatch && modalityMatch && insuranceMatch;
  }), [doctors, insurance, language, modality, specialty]);

  const step = screen === "urgency" ? 1 : screen === "modality" ? 2 : screen === "insurance" ? 3 : 0;
  const headerTitle = screen === "list" ? "Find a doctor" : screen === "loading" ? "Finding your matches" : "Find a doctor";
  const headerSub = screen === "list" ? `${filtered.length} specialists available` : "Quick clinical match";

  function selectAndAdvance(value: string, next: MatchScreen, setter: (value: string) => void) {
    setter(value);
    window.setTimeout(() => setScreen(next), 180);
  }

  function goBack() {
    if (screen === "modality") setScreen("urgency");
    else if (screen === "insurance") setScreen("modality");
    else if (screen === "list" && initialMatch) setScreen("insurance");
    else window.history.back();
  }

  return (
    <FlowFrame className="doctor-flow-frame">
      <main className="flow-shell doctor-flow">
        <header className="flow-header doctor-flow-header">
          <div className="flow-header-row"><button className="icon-button" aria-label="Go back" onClick={goBack}><Icon name="arrow-left" size={18} /></button><div><h1>{headerTitle}</h1><p>{headerSub}</p></div></div>
          {step > 0 && <div className="match-progress" aria-label={`Step ${step} of 3`}><span className={step >= 1 ? "active" : ""} /><span className={step >= 2 ? "active" : ""} /><span className={step >= 3 ? "active" : ""} /></div>}
        </header>

        {screen === "urgency" && <MatchStep eyebrow="Step 1 of 3" title={<>How <em>soon</em> would you like to be seen?</>} helper="We’ll prioritize doctors with availability that fits your needs."><MatchOptions options={[{ label: "As soon as possible", detail: "Today or tomorrow", icon: "activity" }, { label: "Within the next 2 weeks", detail: "More appointment choices", icon: "calendar" }, { label: "I’m flexible", detail: "Show the best overall matches", icon: "clock" }]} selected={urgency} onSelect={(value) => selectAndAdvance(value, "modality", setUrgency)} /></MatchStep>}
        {screen === "modality" && <MatchStep eyebrow="Step 2 of 3" title={<>How would you prefer to <em>meet</em>?</>} helper="You can change this filter later."><MatchOptions options={[{ label: "In person", detail: "At a nearby clinic", icon: "map-pin" }, { label: "Video visit", detail: "From wherever you are", icon: "video" }, { label: "No preference", detail: "Show all available options", icon: "stethoscope" }]} selected={modality} onSelect={(value) => selectAndAdvance(value, "insurance", setModality)} /></MatchStep>}
        {screen === "insurance" && <section className="flow-body match-step"><p className="eyebrow">Step 3 of 3</p><h2>Which <em>insurance</em> will you use?</h2><p>We’ll show providers who accept your plan.</p><label className="search-field"><Icon name="search" size={17} /><input aria-label="Search insurance" value={insurance} onChange={(event) => setInsurance(event.target.value)} placeholder="Search your insurance plan" /></label><div className="insurance-list">{["Aetna", "BlueCross BlueShield", "Cigna", "UnitedHealthcare", "Medicare", "Self pay"].map((item) => <button key={item} className={insurance === item ? "selected" : ""} onClick={() => setInsurance(item)}><span>{item.charAt(0)}</span><strong>{item}</strong>{insurance === item ? <Icon name="check" size={16} /> : <Icon name="chevron-right" size={15} />}</button>)}</div><button className="button primary wide" disabled={!insurance.trim()} onClick={() => setScreen("loading")}>Find my matches <Icon name="search" size={15} /></button></section>}
        {screen === "loading" && <section className="doctor-loading"><div className="match-loader"><Icon name="stethoscope" size={25} /></div><h2>Finding your best matches…</h2><p>Comparing specialty, availability, location and your preferences.</p><div className="loading-lines"><span /><span /><span /></div></section>}
        {screen === "list" && <DoctorList doctors={filtered} languages={languages} language={language} setLanguage={setLanguage} specialties={specialties} specialty={specialty} setSpecialty={setSpecialty} contextual={initialMatch} modality={modality} setModality={setModality} />}
      </main>
    </FlowFrame>
  );
}

function MatchStep({ children, eyebrow, helper, title }: { children: React.ReactNode; eyebrow: string; helper: string; title: React.ReactNode }) {
  return <section className="flow-body match-step"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{helper}</p>{children}</section>;
}

function MatchOptions({ onSelect, options, selected }: { onSelect: (value: string) => void; options: Array<{ label: string; detail: string; icon: "activity" | "calendar" | "clock" | "map-pin" | "video" | "stethoscope" }>; selected: string }) {
  return <div className="match-options">{options.map((option) => <button key={option.label} className={selected === option.label ? "selected" : ""} onClick={() => onSelect(option.label)}><span><Icon name={option.icon} size={19} /></span><span><strong>{option.label}</strong><small>{option.detail}</small></span>{selected === option.label ? <Icon name="check" size={16} /> : <Icon name="chevron-right" size={16} />}</button>)}</div>;
}

function DoctorList({ contextual, doctors, language, languages, modality, setLanguage, setModality, setSpecialty, specialties, specialty }: {
  contextual: boolean;
  doctors: Doctor[];
  language: string;
  languages: string[];
  modality: string;
  setLanguage: (value: string) => void;
  setModality: (value: string) => void;
  setSpecialty: (value: string) => void;
  specialties: string[];
  specialty: string;
}) {
  return <section className="doctor-list-screen">
    {contextual && <div className="clinical-context"><span><Icon name="sparkles" size={16} /></span><div><strong>Matched to your pre-triage</strong><p>Headache · Neurology and primary care</p></div><span className="context-count">{doctors.length} matches</span></div>}
    <div className="directory-segment" aria-label="Visit type"><button className={modality === "In person" ? "active" : ""} onClick={() => setModality("In person")}>In person</button><button className={modality === "Video visit" ? "active" : ""} onClick={() => setModality("Video visit")}>Video visit</button><button className={modality === "No preference" ? "active" : ""} onClick={() => setModality("No preference")}>All</button></div>
    <div className="filter-row" aria-label="Specialty filters">{specialties.map((item) => <button key={item} className={specialty === item ? "filter-chip selected" : "filter-chip"} onClick={() => setSpecialty(item)}>{item}</button>)}</div>
    <div className="filter-row language-filters" aria-label="Language filters">{languages.map((item) => <button key={item} className={language === item ? "filter-chip selected" : "filter-chip"} onClick={() => setLanguage(item)}>{item}</button>)}</div>
    <div className="directory-heading"><div><h2>{contextual ? "Recommended for you" : "Browse specialists"}</h2><p>Sorted by fit, availability and distance</p></div></div>
    <div className="doctor-list">{doctors.length ? doctors.map((doctor, index) => <DoctorCard doctor={doctor} index={index} key={doctor.id} />) : <div className="empty-state"><h2>No exact matches</h2><p>Try another visit type, specialty or language.</p><button className="button secondary" onClick={() => { setSpecialty("All"); setLanguage("All"); setModality("No preference"); }}>Clear filters</button></div>}</div>
    <p className="directory-disclaimer">Provider profiles and availability shown here are synthetic demo data.</p>
  </section>;
}

function DoctorCard({ doctor, index }: { doctor: Doctor; index: number }) {
  return <article className="doctor-card"><span className="match-score"><Icon name="sparkles" size={10} />{doctor.aiMatchScore || Math.max(72, 94 - index * 5)}% match</span><div className="doctor-summary"><div className="doctor-avatar photo-avatar" role="img" aria-label={`Portrait of ${doctor.name}`} style={doctor.photoUrl ? { backgroundImage: `url(${doctor.photoUrl})` } : undefined}>{!doctor.photoUrl && doctor.initials}</div><div className="doctor-card-copy"><h2>{doctor.name}, MD</h2><p>{doctor.specialty} · {doctor.subspecialty}</p><div className="doctor-meta"><span className="rating"><Icon name="star" size={10} />{doctor.rating} ({doctor.reviewCount})</span><span><Icon name="map-pin" size={10} />{doctor.distanceMiles} mi</span></div></div></div><p className="doctor-tagline">{doctor.tagline || doctor.bio}</p><div className="doctor-tags"><span>{doctor.videoVisit ? "Video available" : "In person"}</span><span>{doctor.languages.slice(0, 2).join(" · ")}</span>{doctor.boardCertified && <span>Board certified</span>}</div><div className="next-available"><span><Icon name="clock" size={13} /></span><div><small>Next available</small><strong>{index === 0 ? "Today · 4:00 PM" : index === 1 ? "Tomorrow · 10:00 AM" : "This week"}</strong></div></div><div className="doctor-actions"><Link className="button secondary" href={`/doctors/${doctor.id}`}>View profile</Link><Link className="button primary" href={`/doctors/${doctor.id}/book`}>Book</Link></div></article>;
}
