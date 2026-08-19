"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { preTriageAnswersSchema } from "@/lib/validation/schemas";
import { DEMO_ASSESSMENT_RESULT } from "./demo-result";
import type { PreTriageAnswers } from "@/types/domain";

export async function saveAssessmentDraft(input: {
  id?: string;
  dependentId?: string | null;
  currentStep: number;
  answers: Partial<PreTriageAnswers>;
}) {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { mode: "local" as const, id: input.id || crypto.randomUUID() };
  if (!user) throw new Error("Sign in to save this assessment.");

  const payload = {
    user_id: user.id,
    dependent_id: input.dependentId || null,
    status: "draft",
    current_step: input.currentStep,
    answers: input.answers,
    updated_at: new Date().toISOString()
  };
  const query = input.id
    ? supabase.from("pre_triage_sessions").update(payload).eq("id", input.id).select("id").single()
    : supabase.from("pre_triage_sessions").insert(payload).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error("We could not save this assessment. Please try again.");
  return { mode: "remote" as const, id: data.id as string };
}

export async function completeAssessment(id: string, answers: PreTriageAnswers) {
  const validated = preTriageAnswersSchema.parse(answers);
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { mode: "local" as const, result: DEMO_ASSESSMENT_RESULT };
  if (!user) throw new Error("Sign in to complete this assessment.");

  const { error } = await supabase
    .from("pre_triage_sessions")
    .update({
      status: "completed",
      current_step: 7,
      answers: validated,
      result: DEMO_ASSESSMENT_RESULT,
      result_source: "demo_fixture",
      fixture_version: DEMO_ASSESSMENT_RESULT.fixtureVersion,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error("We could not complete this assessment. Please try again.");
  revalidatePath("/history");
  return { mode: "remote" as const, result: DEMO_ASSESSMENT_RESULT };
}
