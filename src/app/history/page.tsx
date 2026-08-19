import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { HistoryView } from "@/features/pre-triage/history-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { PreTriageSession } from "@/types/domain";

type SessionRow = {
  id: string; user_id: string; dependent_id: string | null; status: PreTriageSession["status"];
  current_step: number; answers: PreTriageSession["answers"]; result: PreTriageSession["result"];
  created_at: string; updated_at: string;
};

export default async function HistoryPage() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  let items: PreTriageSession[] = [];
  if (user && supabase) {
    const { data } = await supabase.from("pre_triage_sessions").select("*").eq("user_id", user.id).eq("status", "completed").order("created_at", { ascending: false });
    items = ((data || []) as SessionRow[]).map((row) => ({ id: row.id, userId: row.user_id, dependentId: row.dependent_id, status: row.status, currentStep: row.current_step, answers: row.answers, result: row.result, createdAt: row.created_at, updatedAt: row.updated_at }));
  }
  return <AppShell><div className="page collection-page"><header className="page-header"><div><h1>History</h1><p>Your Beeexy health activity</p></div><Link className="icon-button" href="/pre-triage/new" aria-label="Start new assessment"><Icon name="plus" size={18} /></Link></header><HistoryView initialItems={items} localMode={!isSupabaseConfigured()} /></div></AppShell>;
}
