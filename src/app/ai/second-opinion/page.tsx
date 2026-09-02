import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SecondOpinionRequestFlow } from "@/features/second-opinion/second-opinion-request-flow";

export const metadata: Metadata = {
  title: "Request a Second Opinion",
};

export default function SecondOpinionRequestPage() {
  return <AppShell><SecondOpinionRequestFlow /></AppShell>;
}

