import type { Metadata } from "next";
import { EntryGate } from "@/features/entry/entry-gate";

export const metadata: Metadata = {
  title: "Welcome",
  description: "Start with Beeexy or continue to sign in.",
};

export default function EntryPage() {
  return <EntryGate />;
}
