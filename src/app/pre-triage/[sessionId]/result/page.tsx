import type { Metadata } from "next";
import { PreTriageResultScreen } from "@/features/pre-triage/pre-triage-flow";

export const metadata: Metadata = { title: "Pre-Triage summary" };

export default function PreTriageResultPage() {
  return <PreTriageResultScreen />;
}
