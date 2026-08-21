import type { Metadata } from "next";
import { PatientDetail } from "@/features/my-circle/patient-detail";

export const metadata: Metadata = { title: "Patient profile" };

export default async function PatientDetailPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return <PatientDetail patientId={patientId} />;
}
