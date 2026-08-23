"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

type HealthView = "personal" | "history" | "insurance" | "notes" | null;

const sections: Array<{ description: string; icon: IconName; title: string; view?: Exclude<HealthView, null>; href?: string }> = [
  { title: "Start Pre-Triage", description: "Create a neutral summary of your symptoms", icon: "activity", href: "/pre-triage/new" },
  { title: "Personal Information", description: "Contact, identity and emergency information", icon: "user", view: "personal" },
  { title: "Medical History", description: "Conditions, medications, allergies and surgeries", icon: "activity", view: "history" },
  { title: "Insurance", description: "Medical, dental and vision plans", icon: "shield", view: "insurance" },
  { title: "My Notes", description: "Notes from your recorded visits", icon: "document", view: "notes" },
  { title: "My Circle", description: "Manage family members and dependents", icon: "users", href: "/my-health/circle" },
];

export function MyHealthDashboard({ email, name }: { email: string; name: string }) {
  const [view, setView] = useState<HealthView>(null);
  const initial = name.charAt(0).toUpperCase();

  if (view) return <HealthSubview email={email} view={view} back={() => setView(null)} />;

  return <div className="page my-health-page"><header className="page-header"><div><h1>My Health</h1><p>Your health record and people</p></div><Link className="icon-button" href="/settings" aria-label="Open settings"><Icon name="settings" size={18} /></Link></header><section className="health-profile-card"><div className="avatar">{initial}</div><div><h2>{name}</h2><p>{email}</p><span><Icon name="shield" size={10} />Private health profile</span></div><Icon name="chevron-right" size={16} /></section><div className="health-completion"><div><strong>Profile readiness</strong><span>Keep details current for smoother care.</span></div><b>20%</b><div><span /></div></div><div className="health-section-label">Health record</div><div className="health-menu-list">{sections.map((item) => item.href ? <Link href={item.href} key={item.title}><HealthMenuItem {...item} /></Link> : <button key={item.title} onClick={() => setView(item.view || null)}><HealthMenuItem {...item} /></button>)}</div><div className="health-section-label">Account</div><Link className="health-account-link" href="/sign-in"><span><Icon name="user" size={16} /></span><strong>Manage sign-in</strong><Icon name="chevron-right" size={15} /></Link></div>;
}

function HealthMenuItem({ description, icon, title }: { description: string; icon: IconName; title: string }) {
  return <><span><Icon name={icon} size={17} /></span><span><strong>{title}</strong><small>{description}</small></span><Icon name="chevron-right" size={15} /></>;
}

function HealthSubview({ back, email, view }: { back: () => void; email: string; view: Exclude<HealthView, null> }) {
  const content = {
    personal: { title: "Personal Information", sub: "Contact and identity details", icon: "user" as const },
    history: { title: "Medical History", sub: "Your clinical background", icon: "activity" as const },
    insurance: { title: "Insurance", sub: "Coverage and plan information", icon: "shield" as const },
    notes: { title: "My Notes", sub: "Notes from visit summaries", icon: "document" as const },
  }[view];
  return <div className="page health-subview"><header className="subview-header"><button className="icon-button" aria-label="Back to My Health" onClick={back}><Icon name="arrow-left" size={18} /></button><div><h1>{content.title}</h1><p>{content.sub}</p></div></header><div className="subview-hero"><span><Icon name={content.icon} size={20} /></span><div><h2>{content.title}</h2><p>Your information stays private and is not available offline.</p></div></div>{view === "personal" && <div className="health-detail-list"><HealthDetail label="Email" value={email} /><HealthDetail label="Phone" value="Add phone number" empty /><HealthDetail label="Emergency contact" value="Add contact" empty /><HealthDetail label="State" value="Add location" empty /></div>}{view === "history" && <div className="health-detail-list"><HealthDetail label="Conditions" value="None added" empty /><HealthDetail label="Medications" value="None added" empty /><HealthDetail label="Allergies" value="None added" empty /><HealthDetail label="Surgeries" value="None added" empty /></div>}{view === "insurance" && <div className="health-subview-empty"><span><Icon name="shield" size={22} /></span><h2>No plans added yet</h2><p>Add medical, dental or vision coverage when secure backend storage is connected.</p><button className="button primary" disabled>Add insurance</button></div>}{view === "notes" && <div className="health-subview-empty"><span><Icon name="document" size={22} /></span><h2>No visit notes yet</h2><p>Notes from My Visit will appear here after secure storage is connected.</p><Link className="button primary" href="/my-visit">Open My Visit</Link></div>}<p className="result-disclaimer">Sensitive health data is never cached for offline access.</p></div>;
}

function HealthDetail({ empty = false, label, value }: { empty?: boolean; label: string; value: string }) {
  return <button><span><small>{label}</small><strong className={empty ? "empty" : ""}>{value}</strong></span><Icon name="chevron-right" size={15} /></button>;
}
