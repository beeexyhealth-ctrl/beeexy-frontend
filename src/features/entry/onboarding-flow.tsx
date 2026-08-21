"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { BeeexyBrand } from "./beeexy-brand";
import { ONBOARDING_STEPS } from "./onboarding-data";
import { OnboardingProgress } from "./onboarding-progress";
import { OnboardingVisual } from "./onboarding-visual";
import { completeOnboarding, hasCompletedOnboarding, resetOnboarding } from "./onboarding-storage";

const totalSteps = ONBOARDING_STEPS.length;

export function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStep = Number(searchParams.get("step"));
  const currentStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= totalSteps ? requestedStep : 1;
  const step = ONBOARDING_STEPS[currentStep - 1];

  useEffect(() => {
    if (searchParams.get("reset") === "1") {
      resetOnboarding();
      router.replace("/onboarding?step=1");
      return;
    }
    if (hasCompletedOnboarding()) {
      router.replace("/login");
      return;
    }
  }, [router, searchParams]);

  const goBack = useCallback(() => {
    if (currentStep > 1) router.push(`/onboarding?step=${currentStep - 1}`);
  }, [currentStep, router]);

  const goForward = useCallback(() => {
    if (currentStep < totalSteps) {
      router.push(`/onboarding?step=${currentStep + 1}`);
      return;
    }
    completeOnboarding();
    router.push("/login");
  }, [currentStep, router]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" && currentStep > 1) goBack();
      if (event.key === "ArrowRight") goForward();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStep, goBack, goForward]);

  return (
    <main className="entry-shell onboarding-shell">
      <div className="entry-ambient" aria-hidden="true"><i /><i /><i /></div>
      <div className="onboarding-stage">
        <header className="onboarding-header">
          <div className="onboarding-header-side">
            {currentStep > 1 && <button className="entry-icon-button" type="button" onClick={goBack} aria-label="Go to previous onboarding step"><Icon name="arrow-left" size={19} /></button>}
          </div>
          <BeeexyBrand compact />
          <OnboardingProgress current={currentStep} total={totalSteps} />
        </header>

        <section className="onboarding-content" key={currentStep} aria-labelledby="onboarding-title">
          <OnboardingVisual name={step.visual} />
          <div className="onboarding-copy">
            <p className="entry-eyebrow">{step.eyebrow}</p>
            <h1 id="onboarding-title">{step.title}</h1>
            <p>{step.description}</p>
          </div>
        </section>

        <footer className="onboarding-footer">
          <button className="entry-primary-button" type="button" onClick={goForward}>
            {step.cta}<Icon name="chevron-right" size={18} />
          </button>
          <p>Use the arrow keys to move between steps.</p>
        </footer>
      </div>
    </main>
  );
}
