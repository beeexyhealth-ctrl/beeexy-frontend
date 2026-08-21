"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/features/auth/auth-provider";
import { MyHealthDashboard } from "@/features/my-health/my-health-dashboard";
import { usePatients } from "@/features/my-circle/patient-provider";
import { displayPatientName } from "@/features/my-circle/patient-state";

export default function MyHealthPage() {
  const { patient } = useAuth();
  const { activePatient } = usePatients();
  const name = activePatient ? displayPatientName(activePatient) : "Beeexy member";
  return <AppShell><MyHealthDashboard email={patient?.beeexyId || "Beeexy profile"} name={name} /></AppShell>;
}
