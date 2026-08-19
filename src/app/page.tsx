import { AppShell } from "@/components/layout/app-shell";
import { HomeDashboard } from "@/features/home/home-dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function HomePage() {
  const user = await getCurrentUser();
  const name = user?.user_metadata?.first_name || user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0];
  return <AppShell><HomeDashboard configured={isSupabaseConfigured()} email={user?.email} name={name} signedIn={Boolean(user)} /></AppShell>;
}
