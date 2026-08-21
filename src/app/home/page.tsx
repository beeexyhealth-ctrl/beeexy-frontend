"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/features/auth/auth-provider";
import { HomeDashboard } from "@/features/home/home-dashboard";

export default function HomePage() {
  const { patient } = useAuth();
  return <AppShell><HomeDashboard configured email={patient?.beeexyId} name="Beeexy member" signedIn /></AppShell>;
}
