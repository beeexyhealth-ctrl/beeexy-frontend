import type { Metadata } from "next";
import { EditPatientForm } from "@/features/my-circle/edit-patient-form";

export const metadata: Metadata = { title: "Edit patient profile" };

export default async function EditPatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return <EditPatientForm patientId={patientId} />;
}
