import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_DOCTORS, DEMO_SLOTS } from "@/features/doctors/fixtures";
import type { Doctor, DoctorSlot } from "@/types/domain";

function mapDoctor(row: Record<string, unknown>): Doctor {
  return {
    id: String(row.id), name: String(row.name), initials: String(row.initials), specialty: String(row.specialty), bio: String(row.bio),
    rating: Number(row.rating), reviewCount: Number(row.review_count), distanceMiles: Number(row.distance_miles),
    languages: (row.languages as string[]) || [], insurances: (row.insurances as string[]) || [], locationName: String(row.location_name),
    address: String(row.address), boardCertified: Boolean(row.board_certified),
    photoUrl: row.photo_url ? String(row.photo_url) : undefined,
    subspecialty: row.subspecialty ? String(row.subspecialty) : undefined,
    yearsExperience: row.years_experience ? Number(row.years_experience) : undefined,
    aiMatchScore: row.ai_match_score ? Number(row.ai_match_score) : undefined,
    videoVisit: row.video_visit === undefined ? undefined : Boolean(row.video_visit),
    tagline: row.tagline ? String(row.tagline) : undefined,
  };
}

export async function listDoctors(): Promise<Doctor[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return DEMO_DOCTORS;
  const { data, error } = await supabase.from("doctors").select("*").eq("published", true).order("rating", { ascending: false });
  if (error || !data?.length) return DEMO_DOCTORS;
  return data.map(mapDoctor);
}

export async function getDoctor(id: string): Promise<Doctor | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return DEMO_DOCTORS.find((doctor) => doctor.id === id) || null;
  const { data } = await supabase.from("doctors").select("*").eq("id", id).eq("published", true).single();
  return data ? mapDoctor(data) : DEMO_DOCTORS.find((doctor) => doctor.id === id) || null;
}

export async function listDoctorSlots(doctorId: string): Promise<DoctorSlot[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return DEMO_SLOTS.filter((slot) => slot.doctorId === doctorId);
  const { data, error } = await supabase.from("available_doctor_slots").select("*").eq("doctor_id", doctorId).gt("starts_at", new Date().toISOString()).order("starts_at");
  if (error || !data?.length) return DEMO_SLOTS.filter((slot) => slot.doctorId === doctorId);
  return data.map((row) => ({ id: row.id, doctorId: row.doctor_id, startsAt: row.starts_at, modality: row.modality, clinicTimeZone: row.clinic_time_zone }));
}
