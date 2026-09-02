import { redirect } from "next/navigation";

export default async function BookPage({ params }: { params: Promise<{ doctorId: string }> }) {
  const { doctorId } = await params;
  redirect(`/doctors/${encodeURIComponent(doctorId)}#availability`);
}
