import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { AppointmentsView } from "@/features/appointments/appointments-view";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { listAppointments } from "@/server/services/appointments";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ dependentId?: string }> }) {
  const { dependentId } = await searchParams;
  const appointments = await listAppointments(dependentId || null);
  return <AppShell><div className="page collection-page"><header className="page-header"><div><h1>Appointments</h1><p>Your upcoming and past visits</p></div><Link className="icon-button" href="/doctors" aria-label="Book an appointment"><Icon name="plus" size={18} /></Link></header><AppointmentsView initialAppointments={appointments} localMode={!isSupabaseConfigured()} /></div></AppShell>;
}
