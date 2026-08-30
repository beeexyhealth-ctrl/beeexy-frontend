import { ClinicDetail } from "@/features/clinics/clinic-detail";

export default async function ClinicDetailPage({ params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params;
  return <ClinicDetail clinicId={clinicId} />;
}
