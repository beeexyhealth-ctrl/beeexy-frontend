import { PreTriageFlow } from "@/features/pre-triage/pre-triage-flow";

export default async function NewPreTriagePage({ searchParams }: { searchParams: Promise<{ dependentId?: string }> }) {
  const { dependentId } = await searchParams;
  return <PreTriageFlow dependentId={dependentId || null} />;
}
