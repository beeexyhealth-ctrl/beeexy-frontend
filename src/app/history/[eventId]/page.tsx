import { AppShell } from "@/components/layout/app-shell";
import { ClinicalHistoryEventView } from "@/features/clinical-history/clinical-history-event-view";

export default async function ClinicalHistoryEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <AppShell><ClinicalHistoryEventView eventId={eventId} /></AppShell>;
}
