import type { Metadata } from "next";
import { CompleteProfile } from "@/features/my-circle/complete-profile";

export const metadata: Metadata = { title: "Complete your profile" };

export default function CompleteProfilePage() {
  return <CompleteProfile />;
}
