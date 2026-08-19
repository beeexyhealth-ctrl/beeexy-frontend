"use server";

import { revalidatePath } from "next/cache";
import { bookingSchema } from "@/lib/validation/schemas";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function bookAppointment(input: { doctorId: string; slotId: string; dependentId: string | null; reason: string | null }) {
  const validated = bookingSchema.parse(input);
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { mode: "local" as const, id: crypto.randomUUID() };
  if (!user) throw new Error("Sign in to reserve this appointment.");

  if (validated.dependentId) {
    const { data: dependent } = await supabase.from("dependents").select("id").eq("id", validated.dependentId).eq("owner_user_id", user.id).single();
    if (!dependent) throw new Error("You are not allowed to book for this person.");
  }
  const { data: slot } = await supabase.from("available_doctor_slots").select("id, doctor_id, modality").eq("id", validated.slotId).eq("doctor_id", validated.doctorId).single();
  if (!slot) throw new Error("This slot is no longer available.");

  const { data, error } = await supabase.from("appointments").insert({
    user_id: user.id,
    dependent_id: validated.dependentId,
    doctor_id: validated.doctorId,
    doctor_slot_id: validated.slotId,
    reason: validated.reason,
    modality: slot.modality,
    status: "confirmed"
  }).select("id").single();
  if (error?.code === "23505") throw new Error("Someone just reserved this time. Please choose another slot.");
  if (error) throw new Error("We could not book this appointment.");
  await supabase.from("notifications").insert({ user_id: user.id, type: "appointment_confirmed", title: "Appointment confirmed", message: "Your appointment is ready in Beeexy.", reference_id: data.id });
  revalidatePath("/"); revalidatePath("/appointments"); revalidatePath("/history");
  return { mode: "remote" as const, id: data.id as string };
}

export async function cancelAppointment(appointmentId: string) {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { mode: "local" as const };
  if (!user) throw new Error("Sign in to manage this appointment.");
  const { error } = await supabase.from("appointments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", appointmentId).eq("user_id", user.id);
  if (error) throw new Error("We could not cancel this appointment.");
  revalidatePath("/appointments");
  return { mode: "remote" as const };
}
