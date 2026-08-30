import Link from "next/link";
import type { KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";

export function DirectoryHeader({ active }: { active: "clinics" | "doctors" }) {
  return (
    <header className="directory-header">
      <div className="directory-header-row">
        <Link href="/home" className="icon-button" aria-label="Back to home"><Icon name="arrow-left" size={18} /></Link>
        <div><p>Demo care directory</p><h1>Find care</h1></div>
      </div>
      <nav className="directory-tabs" aria-label="Care directories">
        <Link href="/doctors" className={active === "doctors" ? "active" : ""} aria-current={active === "doctors" ? "page" : undefined}>Doctors</Link>
        <Link href="/clinics" className={active === "clinics" ? "active" : ""} aria-current={active === "clinics" ? "page" : undefined}>Clinics</Link>
      </nav>
    </header>
  );
}

export function DirectoryDisclaimer({ compact = false }: { compact?: boolean }) {
  return <aside className={`directory-demo-note${compact ? " detail-demo-note" : ""}`} aria-label="Demo directory notice"><Icon name="info" size={15} /><p><strong>Demo directory</strong><span>Provider, credential, and insurance information shown here is synthetic demo data, not real-world verification.</span></p></aside>;
}

export function DirectoryDetailTabs<T extends string>({ activeTab, idPrefix, label, onChange, tabs }: {
  activeTab: T;
  idPrefix: string;
  label: string;
  onChange: (tab: T) => void;
  tabs: readonly { id: T; label: string }[];
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: T) {
    const currentIndex = tabs.findIndex((tab) => tab.id === currentTab);
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onChange(nextTab.id);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${nextTab.id}`)
      ?.focus();
  }

  return (
    <nav className="detail-tab-bar" aria-label={label}>
      <div className="detail-tab-list" role="tablist">
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, tab.id)}
            tabIndex={activeTab === tab.id ? 0 : -1}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function DirectorySkeleton({ cards = 3 }: { cards?: number }) {
  return <div className="phase-seven-skeleton" aria-label="Loading directory" role="status">{Array.from({ length: cards }).map((_, index) => <span key={index} />)}<span className="sr-only">Loading directory…</span></div>;
}

export function DirectoryError({ message, onRetry, retryLabel = "Try again" }: { message: string; onRetry: () => void; retryLabel?: string }) {
  return <div className="phase-seven-state" role="alert"><span><Icon name="info" size={22} /></span><h2>We couldn’t load this directory.</h2><p>{message}</p><button className="button secondary" type="button" onClick={onRetry}>{retryLabel}</button></div>;
}
