"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { PreTriageSession } from "@/types/domain";

export function HistoryView({ initialItems, localMode }: { initialItems: PreTriageSession[]; localMode: boolean }) {
  const [items, setItems] = useState(initialItems);
  useEffect(() => {
    if (!localMode) return;
    const frame = requestAnimationFrame(() => {
      const saved = JSON.parse(localStorage.getItem("beeexy_history") || "[]") as Array<Pick<PreTriageSession, "id" | "status" | "answers" | "result" | "createdAt">>;
      setItems(saved.map((item) => ({ id: item.id, userId: "local", dependentId: null, status: item.status, currentStep: 7, answers: item.answers, result: item.result, createdAt: item.createdAt, updatedAt: item.createdAt })));
    });
    return () => cancelAnimationFrame(frame);
  }, [localMode]);

  if (!items.length) return <div className="collection-empty history-empty"><span><Icon name="history" size={23} /></span><h2>Your History is ready</h2><p>Completed assessments, visit summaries and educational reports will appear here.</p><Link className="button primary" href="/pre-triage/new">Start pre-triage</Link></div>;
  return <div className="history-timeline"><div className="history-group-label">Recent activity</div>{items.map((item) => <Link className="history-entry" href={`/pre-triage/${item.id}`} key={item.id}><span className="history-entry-icon"><Icon name="activity" size={17} /></span><div className="history-entry-copy"><div><span className="status-pill">Pre‑Triage</span><time>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.createdAt))}</time></div><h2>{item.answers.symptom || "Assessment"}</h2><p>{item.result?.urgencyLabel || "Completed assessment"}</p></div><Icon name="chevron-right" size={15} /></Link>)}</div>;
}
