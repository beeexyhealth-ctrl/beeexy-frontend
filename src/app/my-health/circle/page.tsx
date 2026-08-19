import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { CircleManager } from "@/features/my-circle/circle-manager";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import type { Dependent } from "@/types/domain";

type DependentRow = { id: string; owner_user_id: string; relationship: string; first_name: string; last_name: string; birth_date: string; sex_at_birth: Dependent["sexAtBirth"]; state: string };

export default async function MyCirclePage() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  let members: Dependent[] = [];
  if (user && supabase) {
    const { data } = await supabase.from("dependents").select("*").eq("owner_user_id", user.id).order("first_name");
    members = ((data || []) as DependentRow[]).map((row) => ({ id: row.id, ownerUserId: row.owner_user_id, relationship: row.relationship, firstName: row.first_name, lastName: row.last_name, birthDate: row.birth_date, sexAtBirth: row.sex_at_birth, state: row.state }));
  }
  return <AppShell><div className="page circle-page"><Link className="back-link" href="/my-health"><Icon name="arrow-left" size={15} />My Health</Link><header className="page-header"><div><h1>My Circle</h1><p>Your family’s health, one place</p></div></header><CircleManager initialMembers={members} localMode={!isSupabaseConfigured()} /></div></AppShell>;
}
