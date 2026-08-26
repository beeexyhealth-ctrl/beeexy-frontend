import type { Metadata } from "next";
import { PreTriageChatStartScreen } from "@/features/pre-triage-chat/pre-triage-chat-screen";

export const metadata: Metadata = { title: "Start Pre-Triage" };

export default function NewPreTriagePage() {
  return <PreTriageChatStartScreen />;
}
