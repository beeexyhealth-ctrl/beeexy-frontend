import { notFound } from "next/navigation";
import { DoctorProfile } from "@/features/doctors/doctor-profile";
import { getDoctor } from "@/server/services/doctors";

export default async function DoctorProfilePage({ params }: { params: Promise<{ doctorId: string }> }) {
  const { doctorId } = await params;
  const doctor = await getDoctor(doctorId);
  if (!doctor) notFound();
  return <DoctorProfile doctor={doctor} />;
}
