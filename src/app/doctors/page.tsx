import { DoctorDirectory } from "@/features/doctors/doctor-directory";
import { listDoctors } from "@/server/services/doctors";

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<{ match?: string }> }) {
  const [{ match }, doctors] = await Promise.all([searchParams, listDoctors()]);
  return <DoctorDirectory doctors={doctors} initialMatch={match === "1"} />;
}
