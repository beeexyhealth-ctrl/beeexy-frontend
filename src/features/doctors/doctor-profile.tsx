"use client";

import Link from "next/link";
import { useState } from "react";
import { FlowFrame } from "@/components/layout/flow-frame";
import { Icon } from "@/components/ui/icon";
import type { Doctor } from "@/types/domain";

const tabs = ["Highlights", "About", "Insurance", "Locations", "Reviews", "FAQs"] as const;
type ProfileTab = typeof tabs[number];

export function DoctorProfile({ doctor }: { doctor: Doctor }) {
  const [tab, setTab] = useState<ProfileTab>("Highlights");
  const [saved, setSaved] = useState(false);

  function share() {
    const url = window.location.href;
    if (navigator.share) void navigator.share({ title: doctor.name, text: `View ${doctor.name} on Beeexy`, url }).catch(() => undefined);
    else void navigator.clipboard?.writeText(url);
  }

  return <FlowFrame className="doctor-profile-frame"><main className="flow-shell doctor-profile-shell">
    <header className="profile-topbar"><Link href="/doctors" className="icon-button" aria-label="Back to doctors"><Icon name="arrow-left" size={18} /></Link><div><h1>Doctor profile</h1><p>Verified provider</p></div><div className="profile-top-actions"><button className="icon-button" aria-label="Share doctor" onClick={share}><Icon name="share" size={16} /></button><button className={`icon-button ${saved ? "saved" : ""}`} aria-label={saved ? "Remove saved doctor" : "Save doctor"} aria-pressed={saved} onClick={() => setSaved((value) => !value)}><Icon name="bookmark" size={16} fill={saved ? "currentColor" : "none"} /></button></div></header>
    <section className="doctor-profile-scroll">
      <div className="profile-identity"><div className="doctor-avatar profile-photo" role="img" aria-label={`Portrait of ${doctor.name}`} style={doctor.photoUrl ? { backgroundImage: `url(${doctor.photoUrl})` } : undefined}>{!doctor.photoUrl && doctor.initials}<span className="verified-badge"><Icon name="check" size={10} /></span></div><h1>{doctor.name}, MD</h1><p>{doctor.specialty} · {doctor.subspecialty}</p><div className="doctor-tags profile-tags"><span><Icon name="shield" size={10} />{doctor.boardCertified ? "Board certified" : "Verified provider"}</span>{doctor.videoVisit && <span><Icon name="video" size={10} />Video visits</span>}</div></div>
      <div className="profile-stat-grid"><div><strong>{doctor.rating}</strong><span><Icon name="star" size={9} />Rating</span></div><div><strong>{doctor.yearsExperience || 8} yrs</strong><span>Experience</span></div><div><strong>{doctor.distanceMiles} mi</strong><span>Distance</span></div><div><strong>{doctor.reviewCount}</strong><span>Reviews</span></div></div>
      <div className="profile-match-banner"><span><Icon name="sparkles" size={17} /></span><div><strong>{doctor.aiMatchScore || 88}% match for your needs</strong><p>Specialty, language, proximity and availability</p></div></div>
      <nav className="profile-tabs" aria-label="Doctor profile sections" role="tablist">{tabs.map((item) => <button key={item} role="tab" className={tab === item ? "active" : ""} aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</nav>
      <ProfileTabContent doctor={doctor} tab={tab} />
    </section>
    <footer className="profile-book-footer"><div><small>Next available</small><strong>Today · 4:00 PM</strong></div><Link className="button primary" href={`/doctors/${doctor.id}/book`}>See appointments</Link></footer>
  </main></FlowFrame>;
}

function ProfileTabContent({ doctor, tab }: { doctor: Doctor; tab: ProfileTab }) {
  if (tab === "Highlights") return <div className="profile-content"><section className="profile-section"><h2>Why patients choose {doctor.name.split(" ").at(-1)}</h2><p>{doctor.tagline}</p><div className="highlight-list"><div><span><Icon name="activity" size={15} /></span><p><strong>Focused expertise</strong><small>Treats headaches, migraines and related symptoms.</small></p></div><div><span><Icon name="clock" size={15} /></span><p><strong>Availability that fits</strong><small>Appointments available this week.</small></p></div><div><span><Icon name="users" size={15} /></span><p><strong>Patient-centered care</strong><small>Clear communication and thoughtful follow-up.</small></p></div></div></section><section className="profile-section"><h2>Languages</h2><div className="doctor-tags">{doctor.languages.map((language) => <span key={language}>{language}</span>)}</div></section></div>;
  if (tab === "About") return <div className="profile-content"><section className="profile-section"><h2>About {doctor.name}</h2><p>{doctor.bio}</p></section><section className="profile-section"><h2>Credentials</h2><ul className="check-list"><li><Icon name="check" size={13} />{doctor.boardCertified ? `Board Certified — ${doctor.specialty}` : `Licensed — ${doctor.specialty}`}</li><li><Icon name="check" size={13} />Licensed in New York State</li><li><Icon name="check" size={13} />{doctor.yearsExperience || 8} years of clinical experience</li></ul></section></div>;
  if (tab === "Insurance") return <div className="profile-content"><section className="profile-section"><h2>Accepted insurance</h2><p>Coverage can vary by plan. Confirm benefits with the provider before your visit.</p><ul className="insurance-checks">{doctor.insurances.map((insurance) => <li key={insurance}><span>{insurance.charAt(0)}</span><strong>{insurance}</strong><Icon name="check" size={14} /></li>)}</ul></section></div>;
  if (tab === "Locations") return <div className="profile-content"><section className="profile-section location-card"><span><Icon name="map-pin" size={18} /></span><div><h2>{doctor.locationName}</h2><p>{doctor.address}<br />{doctor.distanceMiles} miles away</p><button className="text-button">Get directions</button></div></section>{doctor.videoVisit && <section className="profile-section location-card"><span><Icon name="video" size={18} /></span><div><h2>Video visit</h2><p>Join securely from your phone, tablet or computer.</p></div></section>}</div>;
  if (tab === "Reviews") return <div className="profile-content"><section className="profile-section"><div className="reviews-summary"><strong>{doctor.rating}</strong><div><span>{Array.from({ length: 5 }).map((_, index) => <Icon name="star" size={12} key={index} />)}</span><p>Based on {doctor.reviewCount} verified reviews</p></div></div></section>{["Listened carefully and explained the next steps clearly.", "Thorough, professional, and never felt rushed."].map((review, index) => <section className="profile-section review-card" key={review}><div>{Array.from({ length: 5 }).map((_, star) => <Icon name="star" size={10} key={star} />)}</div><p>“{review}”</p><small>Verified patient · {index ? "March" : "April"} 2026</small></section>)}</div>;
  return <div className="profile-content"><details className="faq-card"><summary>Is {doctor.name} accepting new patients?<Icon name="chevron-down" size={15} /></summary><p>Yes. New patient appointments are currently available.</p></details><details className="faq-card"><summary>Are video visits available?<Icon name="chevron-down" size={15} /></summary><p>{doctor.videoVisit ? "Yes. Video consultations are available for follow-ups and select conditions." : "This provider currently sees patients in person."}</p></details><details className="faq-card"><summary>How should I confirm insurance?<Icon name="chevron-down" size={15} /></summary><p>Contact the provider’s office with your plan details before booking.</p></details></div>;
}
