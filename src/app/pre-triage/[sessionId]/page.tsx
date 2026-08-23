import type { Metadata } from "next";
import { PreTriageIntakeScreen } from "@/features/pre-triage/pre-triage-flow";

export const metadata: Metadata = { title: "Pre-Triage questions" };

export default function PreTriageSessionPage() {
  return <PreTriageIntakeScreen />;
}
