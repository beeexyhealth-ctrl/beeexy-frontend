import { AppShell } from "@/components/layout/app-shell";
import { MyHealthDashboard } from "@/features/my-health/my-health-dashboard";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function MyHealthPage() {
  const user = await getCurrentUser();
  const name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Beeexy user";
  return <AppShell><MyHealthDashboard email={user?.email || "Local review mode"} name={name} /></AppShell>;
}
