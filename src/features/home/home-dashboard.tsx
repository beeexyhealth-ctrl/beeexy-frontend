"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { BeeexyBrand } from "@/features/entry/beeexy-brand";

type HomeDashboardProps = {
  configured: boolean;
  email?: string | null;
  name?: string | null;
  signedIn: boolean;
};

const assistants: Array<{
  action: string;
  badge: string;
  className?: string;
  description: string;
  href: string;
  icon: IconName;
  title: string;
}> = [
  {
    href: "/ai/conversations",
    icon: "message",
    title: "AI Conversations",
    description: "Ask general health questions, understand medical terms, or prepare for a doctor visit.",
    action: "Open conversations",
    badge: "New",
  },
  {
    href: "/pre-triage/new",
    icon: "activity",
    title: "Pre-Triage",
    description: "Organize your symptom, duration, intensity and additional symptoms.",
    action: "Start pre-triage",
    badge: "Active",
    className: "primary-tool",
  },
  {
    href: "/second-opinion",
    icon: "sparkles",
    title: "AI Second Opinion",
    description: "Get an independent perspective on a diagnosis, treatment or test result.",
    action: "Get a second opinion",
    badge: "Available",
  },
  {
    href: "/care-guide",
    icon: "book",
    title: "Care Guide",
    description: "A personalized roadmap, trusted health library and daily companion.",
    action: "Open Care Guide",
    badge: "Available",
  },
  {
    href: "/doctors",
    icon: "stethoscope",
    title: "Find a Doctor",
    description: "Browse synthetic demo doctors and clinics by specialty, language, insurance, or location.",
    action: "Explore directory",
    badge: "New",
    className: "doctor-tool",
  },
];

export function HomeDashboard({ configured, email, name, signedIn }: HomeDashboardProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const displayName = name || "there";
  const initial = name?.charAt(0).toUpperCase() || "B";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        setMenuOpen(false);
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (notificationsOpen && notificationRef.current && !notificationRef.current.contains(event.target as Node)) setNotificationsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [notificationsOpen]);

  return (
    <div className="page home-page">
      <header className="home-greeting">
        <button className={`greet-avatar ${signedIn ? "registered" : ""}`} aria-label="Open menu" onClick={() => setMenuOpen(true)}>
          {signedIn ? initial : <Icon name="menu" size={18} />}
        </button>
        <div className="greet-copy">
          <h1>Hi, {displayName}</h1>
          <p>{signedIn ? "Your health journey, one place" : "Welcome to Beeexy"}</p>
        </div>
        <div className="notification-wrap" ref={notificationRef}>
          <button className="icon-button notification-button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}>
            <Icon name="bell" size={18} />
          </button>
          {notificationsOpen && (
            <section className="notification-popover" aria-label="Notifications">
              <div className="popover-heading"><strong>Notifications</strong><Link href="/notifications" onClick={() => setNotificationsOpen(false)}>View all</Link></div>
              <div className="notification-empty"><span><Icon name="bell" size={18} /></span><strong>You’re all caught up</strong><p>New updates about your care will appear here.</p></div>
            </section>
          )}
        </div>
      </header>

      <p className="hero-copy">I’m here to help you organize health details and prepare for care.</p>

      {!signedIn && (
        <Link href="/login" className="unlock-banner">
          <span className="unlock-icon"><Icon name="lock" size={18} /></span>
          <span className="unlock-content"><strong>Unlock your clinical profile</strong><small>{configured ? "Save assessments, appointments and your care history." : "Explore safely in local review mode. Connect your account when ready."}</small></span>
          <span className="unlock-action">Sign in <Icon name="chevron-right" size={13} /></span>
        </Link>
      )}

      <div className="section-title-row"><div><h2>Your Assistants</h2><p>Choose what you need right now</p></div></div>
      <section className="tool-grid" aria-label="Beeexy assistants">
        {assistants.map((tool) => (
          <Link className={`tool-card ${tool.className || ""}${signedIn && tool.className === "primary-tool" ? " registered-primary" : ""}`} href={tool.href} key={tool.title}>
            <div className="tool-card-head"><span className="tool-icon"><Icon name={tool.icon} size={19} /></span><span className={`badge ${tool.badge === "Active" ? "live" : ""}`}>{tool.badge}</span></div>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            <span className="tool-link">{tool.action}<Icon name="chevron-right" size={13} /></span>
          </Link>
        ))}
      </section>
      <p className="disclaimer">Beeexy provides educational guidance, not a medical diagnosis.<br />If this is an emergency, call 911.</p>

      <button className={`drawer-scrim ${menuOpen ? "open" : ""}`} aria-label="Close menu" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} />
      <aside className={`side-drawer ${menuOpen ? "open" : ""}`} aria-label="Menu" aria-hidden={!menuOpen}>
        <div className="drawer-top"><BeeexyBrand compact /><button className="icon-button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><Icon name="close" size={18} /></button></div>
        <Link href={signedIn ? "/my-health" : "/login"} className="drawer-user-card" onClick={() => setMenuOpen(false)}>
          <span className="avatar">{signedIn ? initial : <Icon name="user" size={19} />}</span>
          <span><strong>{signedIn ? displayName : "Welcome to Beeexy"}</strong><small>{signedIn ? email : "Sign in to unlock all features"}</small></span>
          <Icon name="chevron-right" size={16} />
        </Link>
        {!signedIn && <Link href="/login" className="button primary wide drawer-signin" onClick={() => setMenuOpen(false)}>Sign in or create account</Link>}
        <div className="drawer-group"><p>Preferences</p><DrawerLink href="/settings" icon="settings" label="Settings" close={() => setMenuOpen(false)} /><DrawerLink href="/notifications" icon="bell" label="Notifications" close={() => setMenuOpen(false)} /></div>
        <div className="drawer-group"><p>Find care</p><DrawerLink href="/doctors" icon="stethoscope" label="Doctor & clinic directory" close={() => setMenuOpen(false)} /></div>
        <div className="drawer-group"><p>Your health</p><DrawerLink href="/my-health" icon="heart" label="My Health" close={() => setMenuOpen(false)} /><DrawerLink href="/my-health/circle" icon="users" label="My Circle" close={() => setMenuOpen(false)} /></div>
        <div className="drawer-group"><p>About</p><DrawerLink href="/settings#privacy" icon="shield" label="Privacy & Security" close={() => setMenuOpen(false)} /><DrawerLink href="/settings#help" icon="info" label="Help & Support" close={() => setMenuOpen(false)} /></div>
        <p className="drawer-version">Beeexy · Version 1.0 PWA</p>
      </aside>
    </div>
  );
}

function DrawerLink({ close, href, icon, label }: { close: () => void; href: string; icon: IconName; label: string }) {
  return <Link href={href} className="drawer-link" onClick={close}><span><Icon name={icon} size={17} /></span><strong>{label}</strong><Icon name="chevron-right" size={15} /></Link>;
}
