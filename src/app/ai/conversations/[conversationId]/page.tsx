import { AppShell } from "@/components/layout/app-shell";
import { AiConversationDetail } from "@/features/ai-conversations/ai-conversation-detail";

export default async function AiConversationPage({ params }: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <AppShell><AiConversationDetail conversationId={conversationId} /></AppShell>;
}
