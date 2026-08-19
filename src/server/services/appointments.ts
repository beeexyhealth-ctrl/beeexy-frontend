import "server-only";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { Appointment } from "@/types/domain";

type AppointmentRow = {
  id: string; user_id: string; dependent_id: string | null; doctor_id: string; doctor_slot_id: string;
  reason: string; modality: Appointment["modality"]; status: Appointment["status"]; reminder_enabled: boolean; created_at: string;
  doctor?: { id: string; name: string; initials: string; specialty: string; bio: string; rating: number | string; review_count: number; distance_miles: number | string; languages: string[]; insurances: string[]; location_name: string; address: string; board_certified: boolean } | null;
  slot?: { id: string; doctor_id: string; starts_at: string; modality: Appointment["modality"]; clinic_time_zone: string } | null;
};

export async function listAppointments(dependentId?: string | null): Promise<Appointment[]> {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!user || !supabase) return [];
  let query = supabase.from("appointments").select("*, doctor:doctors(*), slot:doctor_slots(*)").eq("user_id", user.id).order("created_at", { ascending: false });
  query = dependentId ? query.eq("dependent_id", dependentId) : query.is("dependent_id", null);
  const { data } = await query;
  return ((data || []) as AppointmentRow[]).map((row) => ({
    id: row.id, userId: row.user_id, dependentId: row.dependent_id, doctorId: row.doctor_id, doctorSlotId: row.doctor_slot_id,
    reason: row.reason, modality: row.modality, status: row.status, reminderEnabled: row.reminder_enabled, createdAt: row.created_at,
    doctor: row.doctor ? { id: row.doctor.id, name: row.doctor.name, initials: row.doctor.initials, specialty: row.doctor.specialty, bio: row.doctor.bio, rating: Number(row.doctor.rating), reviewCount: row.doctor.review_count, distanceMiles: Number(row.doctor.distance_miles), languages: row.doctor.languages, insurances: row.doctor.insurances, locationName: row.doctor.location_name, address: row.doctor.address, boardCertified: row.doctor.board_certified } : undefined,
    slot: row.slot ? { id: row.slot.id, doctorId: row.slot.doctor_id, startsAt: row.slot.starts_at, modality: row.slot.modality, clinicTimeZone: row.slot.clinic_time_zone } : undefined
  }));
}
