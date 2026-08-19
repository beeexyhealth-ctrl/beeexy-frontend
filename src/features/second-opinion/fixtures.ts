import type { IconName } from "@/components/ui/icon";

export type OpinionTypeKey = "pretriage" | "diagnosis" | "treatment" | "tests";

export type OpinionType = {
  description: string;
  featured?: boolean;
  icon: IconName;
  key: OpinionTypeKey;
  label: string;
};

export const OPINION_TYPES: OpinionType[] = [
  { key: "pretriage", label: "Based on your pre-triage", description: "An independent AI perspective on your most recent assessment.", icon: "sparkles", featured: true },
  { key: "diagnosis", label: "Diagnosis review", description: "Review a diagnosis you received from a doctor.", icon: "document" },
  { key: "treatment", label: "Treatment options", description: "Explore questions and alternatives to discuss with your doctor.", icon: "activity" },
  { key: "tests", label: "Test results", description: "Organize questions about labs, imaging or analysis.", icon: "document" },
];

export const COMMON_CONDITIONS = ["Hypertension", "Diabetes", "Asthma", "Migraine", "Anxiety", "Thyroid"];

export const DEMO_CONSENSUS = [
  "The information deserves review in the context of your full medical history.",
  "Write down timing, changes and any new symptoms before your appointment.",
  "Ask which findings would change the recommended next step.",
];

export const DEMO_QUESTIONS = [
  "What information most strongly supports this conclusion?",
  "What alternatives should we consider or rule out?",
  "Which changes should prompt earlier medical attention?",
];
