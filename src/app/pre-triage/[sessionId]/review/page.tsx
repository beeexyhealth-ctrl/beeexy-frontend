import type { Metadata } from "next";
import { PreTriageReviewScreen } from "@/features/pre-triage/pre-triage-flow";

export const metadata: Metadata = { title: "Review Pre-Triage" };

export default function PreTriageReviewPage() {
  return <PreTriageReviewScreen />;
}
