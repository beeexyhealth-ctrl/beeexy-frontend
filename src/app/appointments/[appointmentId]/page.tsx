import { AppShell } from "@/components/layout/app-shell";
import { AppointmentDetailView } from "@/features/appointments/appointment-detail-view";

export default async function AppointmentDetailPage({ params }: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  return <AppShell><AppointmentDetailView appointmentId={appointmentId} /></AppShell>;
}
