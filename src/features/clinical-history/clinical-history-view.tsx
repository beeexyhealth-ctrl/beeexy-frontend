"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Icon } from "@/components/ui/icon";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";
import type { ClinicalHistoryItem } from "@/lib/beeexy-api/contracts";
import { historyErrorMessage, isInvalidHistoryCursor } from "./clinical-history-state";
import { useClinicalHistory } from "./use-clinical-history";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" });
const TIME_FORMAT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function ClinicalHistoryView() {
  const { activePatient, refreshPatients } = usePatients();
  const patientId = activePatient?.profileId;
  const handleUnavailable = useCallback(() => refreshPatients().then(() => undefined).catch(() => undefined), [refreshPatients]);
  const history = useClinicalHistory(patientId, handleUnavailable);

  return (
    <div className="page collection-page clinical-history-page">
      <header className="page-header">
        <div>
          <h1>Clinical History</h1>
          <p>{activePatient ? `Health activity for ${displayPatientName(activePatient)}` : "Patient health activity"}</p>
        </div>
        <Link className="icon-button" href="/pre-triage/new" aria-label="Start new Pre-Triage"><Icon name="plus" size={18} /></Link>
      </header>

      {history.isLoading ? <HistorySkeleton /> : history.error && !history.items.length ? (
        <HistoryError error={history.error} onRetry={history.refresh} />
      ) : history.items.length ? (
        <>
          <div className="history-timeline" aria-label="Clinical History timeline">
            <div className="history-group-label">Newest first</div>
            {history.items.map((item) => <HistoryEntry item={item} key={item.eventId} />)}
          </div>
          {history.error && (
            <div className="history-inline-error" role="alert">
              <p>{historyErrorMessage(history.error)}</p>
              {isInvalidHistoryCursor(history.error) && <button className="text-button" type="button" onClick={() => void history.refresh()}>Reload timeline</button>}
            </div>
          )}
          {history.nextCursor && (
            <button className="button secondary wide history-load-more" type="button" disabled={history.isLoadingMore} onClick={() => void history.loadMore()}>
              {history.isLoadingMore ? "Loading more…" : "Load more"}
            </button>
          )}
          {!history.nextCursor && !history.error && <p className="history-end">You’ve reached the beginning of this history.</p>}
        </>
      ) : (
        <div className="collection-empty history-empty">
          <span><Icon name="history" size={23} /></span>
          <h2>No Clinical History yet</h2>
          <p>Completed Pre-Triage records for this patient will appear here automatically.</p>
          <Link className="button primary" href="/pre-triage/new">Start Pre-Triage</Link>
        </div>
      )}
    </div>
  );
}

function HistoryEntry({ item }: { item: ClinicalHistoryItem }) {
  const occurredAt = new Date(item.occurredAt);
  return (
    <Link className="history-entry" href={`/history/${encodeURIComponent(item.eventId)}`} aria-label={`View Pre-Triage from ${DATE_FORMAT.format(occurredAt)}`}>
      <span className="history-entry-icon"><Icon name="activity" size={17} /></span>
      <div className="history-entry-copy">
        <div><span className="status-pill completed">Pre-Triage</span><time dateTime={item.occurredAt}>{TIME_FORMAT.format(occurredAt)}</time></div>
        <h2>{DATE_FORMAT.format(occurredAt)}</h2>
        <p>Completed health record · View details</p>
      </div>
      <Icon name="chevron-right" size={15} />
    </Link>
  );
}

function HistorySkeleton() {
  return <div className="history-skeleton" aria-busy="true" aria-label="Loading Clinical History">{[0, 1, 2].map((item) => <span key={item} />)}</div>;
}

function HistoryError({ error, onRetry }: { error: unknown; onRetry: () => Promise<void> }) {
  return (
    <div className="collection-empty history-empty history-error" role="alert">
      <span><Icon name="info" size={23} /></span>
      <h2>Clinical History unavailable</h2>
      <p>{historyErrorMessage(error)}</p>
      <button className="button secondary" type="button" onClick={() => void onRetry()}>Try again</button>
    </div>
  );
}
