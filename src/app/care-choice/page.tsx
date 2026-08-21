import type { Metadata } from "next";
import { CareChoice } from "@/features/my-circle/care-choice";

export const metadata: Metadata = { title: "Who are you caring for?" };

export default function CareChoicePage() {
  return <CareChoice />;
}
