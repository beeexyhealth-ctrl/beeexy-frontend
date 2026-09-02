import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { SecondOpinionResultView } from "@/features/second-opinion/second-opinion-result";

export const metadata: Metadata = {
  title: "Second Opinion result",
};

export default async function SecondOpinionResultPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;
  return (
    <AppShell>
      <SecondOpinionResultView analysisId={analysisId} />
    </AppShell>
  );
}
