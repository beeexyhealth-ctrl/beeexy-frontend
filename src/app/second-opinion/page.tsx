import { SecondOpinionFlow } from "@/features/second-opinion/second-opinion-flow";

export default async function SecondOpinionPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const { source } = await searchParams;
  return <SecondOpinionFlow fromPreTriage={source === "pretriage"} />;
}
