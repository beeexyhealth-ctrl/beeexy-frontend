"use server";

import { revalidatePath } from "next/cache";
import { dependentSchema } from "@/lib/validation/schemas";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function createDependent(input: { firstName: string; lastName: string; relationship: string; birthDate: string; sexAtBirth: "female" | "male" | "prefer_not_to_say"; state: string }) {
  const parsed = dependentSchema.parse(input);
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { mode: "local" as const, id: crypto.randomUUID() };
  if (!user) throw new Error("Sign in to add someone to My Circle.");
  const { data, error } = await supabase.from("dependents").insert({ owner_user_id: user.id, first_name: parsed.firstName, last_name: parsed.lastName, relationship: parsed.relationship, birth_date: parsed.birthDate, sex_at_birth: parsed.sexAtBirth, state: parsed.state }).select("id").single();
  if (error) throw new Error("We could not add this person.");
  revalidatePath("/my-health/circle");
  return { mode: "remote" as const, id: data.id as string };
}

export async function removeDependent(id: string) {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { mode: "local" as const };
  if (!user) throw new Error("Sign in to manage My Circle.");
  const { error } = await supabase.from("dependents").delete().eq("id", id).eq("owner_user_id", user.id);
  if (error) throw new Error("We could not remove this person.");
  revalidatePath("/my-health/circle");
  return { mode: "remote" as const };
}
