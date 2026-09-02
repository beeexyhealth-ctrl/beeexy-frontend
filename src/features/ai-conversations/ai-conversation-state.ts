import type { AiConversationSummary } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export function mergeAiConversationPages(
  current: AiConversationSummary[],
  incoming: AiConversationSummary[],
  hiddenConversationIds: ReadonlySet<string> = new Set(),
) {
  const known = new Set(current.map((conversation) => conversation.conversationId));
  return [
    ...current.filter((conversation) => !hiddenConversationIds.has(conversation.conversationId)),
    ...incoming.filter((conversation) => (
      !known.has(conversation.conversationId)
      && !hiddenConversationIds.has(conversation.conversationId)
    )),
  ];
}

export function formatAiConversationDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function aiConversationLoadErrorMessage(error: unknown) {
  if (error instanceof BeeexyApiError && error.status === 401) {
    return "Your session has ended. Sign in again to continue.";
  }
  if (error instanceof BeeexyNetworkError) {
    return "We couldn’t reach Beeexy. Check your connection and try again.";
  }
  return "We couldn’t load your AI conversations right now.";
}

export function aiConversationCreateErrorMessage(error: unknown) {
  if (error instanceof BeeexyApiError && error.status === 401) {
    return "Your session has ended. Sign in again to continue.";
  }
  if (error instanceof BeeexyApiError && error.status === 404) {
    return "The selected patient profile is unavailable. Review your selection and try again.";
  }
  if (error instanceof BeeexyApiError && error.status === 422) {
    return "Choose a conversation topic and try again.";
  }
  if (error instanceof BeeexyNetworkError) {
    return "We couldn’t reach Beeexy. Your conversation was not started here; check your connection before trying again.";
  }
  return "We couldn’t start this conversation right now.";
}

export function aiConversationSendError(error: unknown) {
  const errorCode = error instanceof BeeexyApiError ? error.problem?.errorCode : undefined;

  if (error instanceof BeeexyApiError && error.status === 401) {
    return { message: "Your session has ended. Sign in again to continue.", limitReached: false };
  }
  if (error instanceof BeeexyApiError && error.status === 404) {
    return { message: "This conversation is unavailable.", limitReached: false };
  }
  if (error instanceof BeeexyApiError && error.status === 409) {
    return {
      message: "Beeexy is already preparing a response for this conversation. Please wait before sending another message.",
      limitReached: false,
    };
  }
  if (error instanceof BeeexyApiError && error.status === 422) {
    if (errorCode === "ai.conversation.message_limit_reached") {
      return {
        message: "This conversation has reached its message limit. You can still read it or start a new conversation.",
        limitReached: true,
      };
    }
    if (errorCode === "ai.conversation.request_not_supported") {
      return {
        message: "Beeexy couldn’t process that request. Try a general health question, ask about a medical term, or prepare a question for your doctor.",
        limitReached: false,
      };
    }
    return {
      message: "Enter a clear message of up to 4,000 characters and try again.",
      limitReached: false,
    };
  }
  if (error instanceof BeeexyNetworkError) {
    return {
      message: "We couldn’t confirm whether the message was received. Refresh this conversation before trying again.",
      limitReached: false,
    };
  }
  return {
    message: "Beeexy couldn’t send this message right now. Your conversation history is still available.",
    limitReached: false,
  };
}

export function aiConversationDeleteErrorMessage(error: unknown) {
  if (error instanceof BeeexyApiError && error.status === 401) {
    return "Your session has ended. Sign in again to continue.";
  }
  if (error instanceof BeeexyNetworkError) {
    return "We couldn’t confirm the removal. Check your connection and try again.";
  }
  return "We couldn’t remove this conversation from AI History right now.";
}
