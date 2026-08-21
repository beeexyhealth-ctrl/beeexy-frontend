"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/features/auth/auth-provider";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";
import { HomeDashboard } from "@/features/home/home-dashboard";

export default function HomePage() {
  const { patient } = useAuth();
  const { activePatient } = usePatients();
  return <AppShell><HomeDashboard configured email={patient?.beeexyId} name={activePatient ? displayPatientName(activePatient) : "Beeexy member"} signedIn /></AppShell>;
}
