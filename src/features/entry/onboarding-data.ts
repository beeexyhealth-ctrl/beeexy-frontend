export type OnboardingVisualName = "understand" | "guidance" | "connected";

export type OnboardingStep = {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  visual: OnboardingVisualName;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    eyebrow: "Understand your health",
    title: "Understand what your symptoms may mean",
    description: "Beeexy helps you organize what you’re feeling and guides you toward the right next step.",
    cta: "Continue",
    visual: "understand",
  },
  {
    eyebrow: "Get guidance",
    title: "Get clearer guidance before your next step",
    description: "Answer a few focused questions so Beeexy can help you prepare and understand what may require attention.",
    cta: "Continue",
    visual: "guidance",
  },
  {
    eyebrow: "Stay connected",
    title: "Your health journey, organized in one place",
    description: "Keep your information, care guidance, appointments, and future health interactions connected through Beeexy.",
    cta: "Get started",
    visual: "connected",
  },
] as const;
