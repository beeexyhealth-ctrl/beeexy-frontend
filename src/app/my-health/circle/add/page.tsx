import type { Metadata } from "next";
import { AddPatientForm } from "@/features/my-circle/add-patient-form";

export const metadata: Metadata = { title: "Add to My Circle" };

export default async function AddToCirclePage({ searchParams }: { searchParams: Promise<{ initial?: string }> }) {
  const query = await searchParams;
  return <AddPatientForm initialFlow={query.initial === "1"} />;
}
