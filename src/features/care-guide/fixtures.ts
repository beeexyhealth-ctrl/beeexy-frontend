import type { IconName } from "@/components/ui/icon";

export const CARE_TOPICS: Array<{ icon: IconName; label: string; question: string }> = [
  { icon: "activity", label: "Hydration", question: "How much water should I drink daily, and what are signs of dehydration?" },
  { icon: "brain", label: "Stress", question: "What are effective techniques to manage daily stress?" },
  { icon: "clock", label: "Sleep", question: "How can I improve my sleep quality naturally?" },
  { icon: "heart", label: "Exercise", question: "What is a balanced exercise routine for a busy schedule?" },
  { icon: "activity", label: "Nutrition", question: "What are the basics of a balanced diet for general health?" },
];

export const LIBRARY_ITEMS = [
  { type: "Video", title: "Understanding common headache patterns", time: "4 min", category: "Symptoms" },
  { type: "Article", title: "Preparing useful notes before a doctor visit", time: "6 min", category: "Appointments" },
  { type: "Guide", title: "Sleep, hydration and everyday triggers", time: "8 min", category: "Wellness" },
  { type: "Podcast", title: "How to ask better health questions", time: "12 min", category: "Appointments" },
];

export const ROADMAP_STEPS = [
  { status: "complete", title: "Pre-triage completed", detail: "Your symptoms and timeline are organized." },
  { status: "current", title: "Choose your next care step", detail: "Review matched doctors or prepare questions." },
  { status: "upcoming", title: "Prepare for the visit", detail: "Keep notes, questions and changes together." },
  { status: "upcoming", title: "Follow up", detail: "Record next steps and monitor meaningful changes." },
];
