import { DoctorProfile } from "@/features/doctors/doctor-profile";

export default async function DoctorProfilePage({ params }: { params: Promise<{ doctorId: string }> }) {
  const { doctorId } = await params;
  return <DoctorProfile doctorId={doctorId} />;
}
