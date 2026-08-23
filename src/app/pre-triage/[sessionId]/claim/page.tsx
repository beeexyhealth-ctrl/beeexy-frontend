import type { Metadata } from "next";
import { PreTriageClaimScreen } from "@/features/pre-triage/pre-triage-flow";

export const metadata: Metadata = { title: "Save Pre-Triage" };

export default function PreTriageClaimPage() {
  return <PreTriageClaimScreen />;
}
