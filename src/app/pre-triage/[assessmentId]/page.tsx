import { notFound } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { AssessmentResultView, PreTriageFlow } from "@/features/pre-triage/pre-triage-flow";
import type { PreTriageSession } from "@/types/domain";

export default async function AssessmentPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = await params;
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!user || !supabase) return <PreTriageFlow />;
  const { data } = await supabase.from("pre_triage_sessions").select("*").eq("id", assessmentId).eq("user_id", user.id).single();
  if (!data) notFound();
  if (data.status === "completed") return <AssessmentResultView />;
  const session: PreTriageSession = { id: data.id, userId: data.user_id, dependentId: data.dependent_id, status: data.status, currentStep: data.current_step, answers: data.answers, result: data.result, createdAt: data.created_at, updatedAt: data.updated_at };
  return <PreTriageFlow initialSession={session} dependentId={session.dependentId} />;
}
