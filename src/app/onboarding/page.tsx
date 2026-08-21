import type { Metadata } from "next";
import { Suspense } from "react";
import { EntryLoading } from "@/features/entry/entry-loading";
import { OnboardingFlow } from "@/features/entry/onboarding-flow";

export const metadata: Metadata = {
  title: "Get started",
  description: "A short introduction to Beeexy.",
};

export default function OnboardingPage() {
  return <Suspense fallback={<EntryLoading />}><OnboardingFlow /></Suspense>;
}
