import type { Metadata } from "next";
import { PreTriageChatSessionScreen } from "@/features/pre-triage-chat/pre-triage-chat-screen";

export const metadata: Metadata = { title: "Chat Pre-Triage" };

export default function PreTriageSessionPage() {
  return <PreTriageChatSessionScreen />;
}
