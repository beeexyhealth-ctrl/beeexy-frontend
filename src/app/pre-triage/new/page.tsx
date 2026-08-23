import type { Metadata } from "next";
import { PreTriageStartScreen } from "@/features/pre-triage/pre-triage-flow";

export const metadata: Metadata = { title: "Start Pre-Triage" };

export default function NewPreTriagePage() {
  return <PreTriageStartScreen />;
}
