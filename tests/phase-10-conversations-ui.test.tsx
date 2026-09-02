// @vitest-environment jsdom

import type { AnchorHTMLAttributes } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

const patientContext = vi.hoisted(() => ({
  activePatient: null as import("@/lib/beeexy-api/contracts").AccessiblePatient | null,
  bootstrapStatus: "ready" as "idle" | "loading" | "ready" | "error",
  patients: [] as import("@/lib/beeexy-api/contracts").AccessiblePatient[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/features/my-circle/patient-provider", () => ({
  usePatients: () => patientContext,
}));

import { isPublicRoute } from "@/features/auth/auth-route-boundary";
import { AiConversationDetail } from "@/features/ai-conversations/ai-conversation-detail";
import { AiConversationHistory } from "@/features/ai-conversations/ai-conversation-history";
import { HomeDashboard } from "@/features/home/home-dashboard";
import type {
  AccessiblePatient,
  AiConversation,
  AiConversationDetail as AiConversationDetailContract,
  AiConversationExecution,
  AiConversationMessage,
  AiConversationSummary,
} from "@/lib/beeexy-api/contracts";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const conversationA = "bf981c53-bf8e-41e2-ad47-1c6cf8574d85";
const conversationB = "bf981c53-bf8e-41e2-ad47-1c6cf8574d86";
const patientA: AccessiblePatient = {
  profileId: "9fb45f87-f9dd-4dbf-a2d5-b2be4cd41624",
  beeexyId: "BXY-A",
  firstName: "Avery",
  lastName: "Patient",
  accessType: "Primary",
  relationship: null,
};
const patientB: AccessiblePatient = {
  profileId: "9fb45f87-f9dd-4dbf-a2d5-b2be4cd41625",
  beeexyId: "BXY-B",
  firstName: "Bailey",
  lastName: "Rivera",
  accessType: "Managed",
  relationship: {
    relationshipId: "relationship-b",
    type: "Child",
  },
};
const disclaimer = {
  version: "ai-general-disclaimer-v1",
  content: "Esta respuesta ha sido generada por inteligencia artificial y no sustituye una evaluación médica.",
};
const firstSummary: AiConversationSummary = {
  conversationId: conversationA,
  patientId: null,
  createdAt: "2026-09-02T15:10:00+00:00",
};
const secondSummary: AiConversationSummary = {
  conversationId: conversationB,
  patientId: patientA.profileId,
  createdAt: "2026-09-01T15:10:00+00:00",
};
const userMessage: AiConversationMessage = {
  messageId: "4a4f5b9d-54cc-426a-a600-ece49a1c88e7",
  role: "user",
  content: "What does hydration mean for general health?",
  sequence: 1,
  createdAt: "2026-09-02T15:11:00+00:00",
};
const assistantMessage: AiConversationMessage = {
  messageId: "7c07cc20-a45e-49fd-b569-d9153f0587ee",
  role: "assistant",
  content: "Approved informational content from Beeexy.",
  sequence: 2,
  createdAt: "2026-09-02T15:11:01+00:00",
};
const generalDetail: AiConversationDetailContract = {
  conversation: firstSummary,
  messages: [userMessage, assistantMessage],
  disclaimer,
};
const patientDetail: AiConversationDetailContract = {
  conversation: secondSummary,
  messages: [userMessage, assistantMessage],
  disclaimer,
};
const execution: AiConversationExecution = {
  conversationId: conversationA,
  userMessageId: userMessage.messageId,
  executionId: "11cf606a-fadf-48cb-a174-4170666b9f55",
  status: "completed",
  assistantMessage,
  disclaimer,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  patientContext.activePatient = patientA;
  patientContext.bootstrapStatus = "ready";
  patientContext.patients = [patientA, patientB];
  vi.spyOn(beeexyPhase10Api, "listAiConversations").mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(beeexyPhase10Api, "createAiConversation").mockResolvedValue({
    ...firstSummary,
    disclaimer,
  });
  vi.spyOn(beeexyPhase10Api, "getAiConversation").mockResolvedValue(generalDetail);
  vi.spyOn(beeexyPhase10Api, "sendAiConversationMessage").mockResolvedValue(execution);
  vi.spyOn(beeexyPhase10Api, "deleteAiConversation").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Phase 10.2 AI Conversation history and creation", () => {
  it("keeps both AI Conversation routes authenticated and exposes one additive home entry", () => {
    expect(isPublicRoute("/ai/conversations")).toBe(false);
    expect(isPublicRoute(`/ai/conversations/${conversationA}`)).toBe(false);
    render(<HomeDashboard configured email="avery@example.com" name="Avery" signedIn />);
    expect(screen.getByRole("link", { name: /AI Conversations/i })).toHaveAttribute(
      "href",
      "/ai/conversations",
    );
  });

  it("shows a dedicated loading state without flashing the empty state", async () => {
    const pending = deferred<{ items: AiConversationSummary[]; nextCursor: string | null }>();
    vi.mocked(beeexyPhase10Api.listAiConversations).mockReturnValue(pending.promise);

    render(<AiConversationHistory />);

    expect(screen.getByRole("status", { name: "Loading AI Conversation history" })).toBeInTheDocument();
    expect(screen.queryByText("You haven’t started a conversation yet.")).not.toBeInTheDocument();
    await waitFor(() => expect(beeexyPhase10Api.listAiConversations).toHaveBeenCalledWith(
      {},
      expect.any(AbortSignal),
    ));
  });

  it("renders the empty state and opens the create-conversation dialog", async () => {
    render(<AiConversationHistory />);

    expect(await screen.findByText("You haven’t started a conversation yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start a conversation" }));
    expect(screen.getByRole("dialog", { name: "Choose a starting point" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /General · no patient/i })).toBeChecked();
  });

  it("preserves backend ordering and renders only documented summary metadata", async () => {
    vi.mocked(beeexyPhase10Api.listAiConversations).mockResolvedValue({
      items: [firstSummary, secondSummary],
      nextCursor: null,
    });
    render(<AiConversationHistory />);

    const list = await screen.findByRole("list", { name: "AI Conversation history" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/ai/conversations/${conversationA}`,
      `/ai/conversations/${conversationB}`,
    ]);
    expect(within(list).getByText("General · no patient association")).toBeInTheDocument();
    expect(within(list).getByText("Patient-associated conversation")).toBeInTheDocument();
    expect(list).not.toHaveTextContent(conversationA);
    expect(list).not.toHaveTextContent(patientA.profileId);
  });

  it("loads the opaque cursor once, appends in backend order, and removes duplicates", async () => {
    vi.mocked(beeexyPhase10Api.listAiConversations)
      .mockResolvedValueOnce({ items: [firstSummary], nextCursor: "opaque+/=? token" })
      .mockResolvedValueOnce({ items: [firstSummary, secondSummary], nextCursor: null });
    render(<AiConversationHistory />);

    fireEvent.click(await screen.findByRole("button", { name: "Load more conversations" }));
    await screen.findByText("Patient-associated conversation");

    expect(beeexyPhase10Api.listAiConversations).toHaveBeenNthCalledWith(
      2,
      { cursor: "opaque+/=? token" },
      expect.any(AbortSignal),
    );
    expect(screen.getAllByRole("link", { name: /Open conversation started/i })).toHaveLength(2);
  });

  it("keeps existing history and offers a cursor restart after pagination failure", async () => {
    vi.mocked(beeexyPhase10Api.listAiConversations)
      .mockResolvedValueOnce({ items: [firstSummary], nextCursor: "stale" })
      .mockRejectedValueOnce(new BeeexyApiError(422, { problem: { errorCode: "ai.conversation.cursor_invalid" } }))
      .mockResolvedValueOnce({ items: [firstSummary], nextCursor: null });
    render(<AiConversationHistory />);

    fireEvent.click(await screen.findByRole("button", { name: "Load more conversations" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Restart history");
    expect(screen.getByRole("link", { name: /Open conversation started/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart history" }));
    await waitFor(() => expect(beeexyPhase10Api.listAiConversations).toHaveBeenCalledTimes(3));
  });

  it("renders a safe list error and never exposes backend details", async () => {
    vi.mocked(beeexyPhase10Api.listAiConversations).mockRejectedValue(new BeeexyApiError(500, {
      problem: { detail: "provider stack and secret" },
    }));
    render(<AiConversationHistory />);

    expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t load your AI conversations");
    expect(screen.queryByText("provider stack and secret")).not.toBeInTheDocument();
  });

  it("creates a general conversation once with no invented message and navigates by returned ID", async () => {
    const pending = deferred<AiConversation>();
    vi.mocked(beeexyPhase10Api.createAiConversation).mockReturnValue(pending.promise);
    render(<AiConversationHistory />);
    fireEvent.click(await screen.findByRole("button", { name: "Start a conversation" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Start conversation" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Starting…" }));

    expect(beeexyPhase10Api.createAiConversation).toHaveBeenCalledOnce();
    expect(beeexyPhase10Api.createAiConversation).toHaveBeenCalledWith(
      { purpose: "GENERAL_HEALTH" },
      expect.any(AbortSignal),
    );
    expect(beeexyPhase10Api.sendAiConversationMessage).not.toHaveBeenCalled();

    await act(async () => pending.resolve({ ...firstSummary, disclaimer }));
    expect(navigation.push).toHaveBeenCalledWith(`/ai/conversations/${conversationA}`);
  });

  it("creates a conversation only with an explicitly selected authorized patient and purpose", async () => {
    render(<AiConversationHistory />);
    fireEvent.click(await screen.findByRole("button", { name: "Start a conversation" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /Understand medical terms/i }));
    fireEvent.click(within(dialog).getByRole("radio", { name: /Bailey Rivera/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Start conversation" }));

    await waitFor(() => expect(beeexyPhase10Api.createAiConversation).toHaveBeenCalledWith(
      { purpose: "MEDICAL_TERMS", patientId: patientB.profileId },
      expect.any(AbortSignal),
    ));
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not silently rebind an explicit patient selection when the active patient changes", async () => {
    const view = render(<AiConversationHistory />);
    fireEvent.click(await screen.findByRole("button", { name: "Start a conversation" }));
    fireEvent.click(screen.getByRole("radio", { name: /Bailey Rivera/i }));
    patientContext.activePatient = patientA;
    view.rerender(<AiConversationHistory />);
    fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));

    await waitFor(() => expect(beeexyPhase10Api.createAiConversation).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: patientB.profileId }),
      expect.any(AbortSignal),
    ));
  });

  it("maps concealed patient errors without leaking ownership information", async () => {
    vi.mocked(beeexyPhase10Api.createAiConversation).mockRejectedValue(new BeeexyApiError(404, {
      problem: { detail: "belongs to a different account" },
    }));
    render(<AiConversationHistory />);
    fireEvent.click(await screen.findByRole("button", { name: "Start a conversation" }));
    fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("selected patient profile is unavailable");
    expect(screen.queryByText("belongs to a different account")).not.toBeInTheDocument();
  });

  it("shows safe creation validation feedback without exposing backend details", async () => {
    vi.mocked(beeexyPhase10Api.createAiConversation).mockRejectedValue(new BeeexyApiError(422, {
      problem: { errorCode: "ai.conversation.purpose_invalid", detail: "internal enum mismatch" },
    }));
    render(<AiConversationHistory />);
    fireEvent.click(await screen.findByRole("button", { name: "Start a conversation" }));
    fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a conversation topic");
    expect(screen.queryByText("internal enum mismatch")).not.toBeInTheDocument();
  });

  it("logically removes a conversation after accessible confirmation and prevents duplicate deletion", async () => {
    const pending = deferred<void>();
    vi.mocked(beeexyPhase10Api.listAiConversations).mockResolvedValue({ items: [firstSummary], nextCursor: null });
    vi.mocked(beeexyPhase10Api.deleteAiConversation).mockReturnValue(pending.promise);
    render(<AiConversationHistory />);

    fireEvent.click(await screen.findByRole("button", { name: /Remove conversation started/i }));
    const dialog = screen.getByRole("dialog", { name: "Remove this conversation?" });
    expect(dialog).toHaveTextContent("won’t see it in your normal AI Conversation history");
    const remove = within(dialog).getByRole("button", { name: "Remove from history" });
    fireEvent.click(remove);
    fireEvent.click(within(dialog).getByRole("button", { name: "Removing…" }));
    expect(beeexyPhase10Api.deleteAiConversation).toHaveBeenCalledOnce();
    expect(beeexyPhase10Api.deleteAiConversation).toHaveBeenCalledWith(
      conversationA,
      expect.any(AbortSignal),
    );

    await act(async () => pending.resolve());
    expect(screen.queryByRole("link", { name: /Open conversation started/i })).not.toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("removed from AI History");
  });

  it("does not reintroduce a locally removed conversation when history refreshes", async () => {
    vi.mocked(beeexyPhase10Api.listAiConversations).mockResolvedValue({ items: [firstSummary], nextCursor: null });
    render(<AiConversationHistory />);
    fireEvent.click(await screen.findByRole("button", { name: /Remove conversation started/i }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from history" }));
    await screen.findByText("Conversation removed from AI History.");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(beeexyPhase10Api.listAiConversations).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("link", { name: /Open conversation started/i })).not.toBeInTheDocument();
  });

  it("handles concealed deletion 404 as a neutral unavailable removal", async () => {
    vi.mocked(beeexyPhase10Api.listAiConversations).mockResolvedValue({ items: [firstSummary], nextCursor: null });
    vi.mocked(beeexyPhase10Api.deleteAiConversation).mockRejectedValue(new BeeexyApiError(404, {
      problem: { detail: "foreign owner" },
    }));
    render(<AiConversationHistory />);
    fireEvent.click(await screen.findByRole("button", { name: /Remove conversation started/i }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from history" }));

    expect(await screen.findByText(/no longer available and was removed/i)).toBeInTheDocument();
    expect(screen.queryByText("foreign owner")).not.toBeInTheDocument();
  });
});

describe("Phase 10.2 AI Conversation detail and messaging", () => {
  it("loads the exact route ID with cancellation and shows no stale content during loading", async () => {
    const pending = deferred<AiConversationDetailContract>();
    vi.mocked(beeexyPhase10Api.getAiConversation).mockReturnValue(pending.promise);
    render(<AiConversationDetail conversationId={conversationA} />);

    expect(screen.getByRole("status", { name: "Loading AI Conversation" })).toBeInTheDocument();
    expect(screen.queryByText(userMessage.content)).not.toBeInTheDocument();
    await waitFor(() => expect(beeexyPhase10Api.getAiConversation).toHaveBeenCalledWith(
      conversationA,
      expect.any(AbortSignal),
    ));
  });

  it("renders exact backend message order, semantic roles, plain text, and disclaimer", async () => {
    const unsafe = "<img src=x onerror=alert(1)> Plain assistant text";
    vi.mocked(beeexyPhase10Api.getAiConversation).mockResolvedValue({
      ...generalDetail,
      messages: [userMessage, { ...assistantMessage, content: unsafe }],
    });
    const view = render(<AiConversationDetail conversationId={conversationA} />);

    const list = await screen.findByRole("list", { name: "Conversation messages" });
    const messages = within(list).getAllByRole("listitem");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveTextContent(userMessage.content);
    expect(messages[0]).toHaveTextContent("You");
    expect(messages[1]).toHaveTextContent(unsafe);
    expect(messages[1]).toHaveTextContent("Beeexy AI");
    expect(view.container.querySelector("img")).toBeNull();
    expect(screen.getByLabelText("AI disclaimer")).toHaveTextContent(disclaimer.content);
    expect(screen.getByLabelText("AI disclaimer")).toHaveAttribute(
      "data-disclaimer-version",
      disclaimer.version,
    );
    expect(screen.queryByText(/provider|prompt|safety category/i)).not.toBeInTheDocument();
  });

  it("renders a normal no-message state without inventing an assistant message", async () => {
    vi.mocked(beeexyPhase10Api.getAiConversation).mockResolvedValue({ ...generalDetail, messages: [] });
    render(<AiConversationDetail conversationId={conversationA} />);

    expect(await screen.findByText("Ask your first question")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Message from Beeexy AI" })).not.toBeInTheDocument();
  });

  it("fails safely for an unsupported runtime message role without exposing JSON", async () => {
    const unsupported = {
      ...assistantMessage,
      role: "system",
      content: "internal system content",
    } as unknown as AiConversationMessage;
    vi.mocked(beeexyPhase10Api.getAiConversation).mockResolvedValue({
      ...generalDetail,
      messages: [unsupported],
    });
    render(<AiConversationDetail conversationId={conversationA} />);

    expect(await screen.findByText("This message type can’t be displayed.")).toBeInTheDocument();
    expect(screen.queryByText("internal system content")).not.toBeInTheDocument();
    expect(screen.queryByText("system")).not.toBeInTheDocument();
  });

  it("hides patient-associated content when another active profile is selected", async () => {
    patientContext.activePatient = patientB;
    vi.mocked(beeexyPhase10Api.getAiConversation).mockResolvedValue(patientDetail);
    render(<AiConversationDetail conversationId={conversationB} />);

    expect(await screen.findByText("Switch back to this conversation’s patient")).toBeInTheDocument();
    expect(screen.queryByText(userMessage.content)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Message Beeexy AI")).not.toBeInTheDocument();
    expect(screen.getByText(/association has not changed/i)).toBeInTheDocument();
  });

  it("keeps a general conversation available when the active patient changes", async () => {
    patientContext.activePatient = patientB;
    render(<AiConversationDetail conversationId={conversationA} />);
    expect(await screen.findByText(userMessage.content)).toBeInTheDocument();
    expect(screen.getByLabelText("Message Beeexy AI")).toBeEnabled();
  });

  it("prevents whitespace-only sends", async () => {
    render(<AiConversationDetail conversationId={conversationA} />);
    const composer = await screen.findByLabelText("Message Beeexy AI");
    fireEvent.change(composer, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Message Beeexy" }));
    expect(beeexyPhase10Api.sendAiConversationMessage).not.toHaveBeenCalled();
  });

  it("sends exactly once, consumes the terminal 202 result, refetches once, and reveals safe content", async () => {
    const pending = deferred<AiConversationExecution>();
    const safeAssistant = { ...assistantMessage, content: "Backend-approved safe response." };
    vi.mocked(beeexyPhase10Api.sendAiConversationMessage).mockReturnValue(pending.promise);
    vi.mocked(beeexyPhase10Api.getAiConversation)
      .mockResolvedValueOnce(generalDetail)
      .mockResolvedValueOnce({ ...generalDetail, messages: [userMessage, safeAssistant] });
    render(<AiConversationDetail conversationId={conversationA} />);
    const composer = await screen.findByLabelText("Message Beeexy AI");
    fireEvent.change(composer, { target: { value: "  Explain hydration  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    fireEvent.submit(screen.getByRole("form", { name: "Message Beeexy" }));

    expect(beeexyPhase10Api.sendAiConversationMessage).toHaveBeenCalledOnce();
    expect(beeexyPhase10Api.sendAiConversationMessage).toHaveBeenCalledWith(
      conversationA,
      { content: "Explain hydration" },
      expect.any(AbortSignal),
    );
    expect(composer).toBeDisabled();

    await act(async () => pending.resolve({ ...execution, assistantMessage: safeAssistant }));
    expect(await screen.findByText("Backend-approved safe response.")).toBeInTheDocument();
    await waitFor(() => expect(composer).toHaveValue(""));
    expect(beeexyPhase10Api.getAiConversation).toHaveBeenCalledTimes(2);
    expect(beeexyPhase10Api.sendAiConversationMessage).toHaveBeenCalledTimes(1);
  });

  it("renders a backend-controlled fallback exactly like safe assistant content", async () => {
    const fallback = { ...assistantMessage, content: "Beeexy-controlled fallback content." };
    vi.mocked(beeexyPhase10Api.getAiConversation)
      .mockResolvedValueOnce(generalDetail)
      .mockResolvedValueOnce({ ...generalDetail, messages: [userMessage, fallback] });
    vi.mocked(beeexyPhase10Api.sendAiConversationMessage).mockResolvedValue({
      ...execution,
      assistantMessage: fallback,
    });
    render(<AiConversationDetail conversationId={conversationA} />);
    fireEvent.change(await screen.findByLabelText("Message Beeexy AI"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("article", { name: "Message from Beeexy AI" })).toHaveTextContent(
      fallback.content,
    );
    expect(screen.queryByText(/rejection category|unsafe output/i)).not.toBeInTheDocument();
  });

  it("handles 409 without retrying, preserves history, and restores the composer", async () => {
    vi.mocked(beeexyPhase10Api.sendAiConversationMessage).mockRejectedValue(new BeeexyApiError(409, {
      problem: { errorCode: "ai.conversation.execution_conflict" },
    }));
    render(<AiConversationDetail conversationId={conversationA} />);
    const composer = await screen.findByLabelText("Message Beeexy AI");
    fireEvent.change(composer, { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("already preparing a response");
    expect(composer).toHaveValue("Keep this draft");
    expect(composer).toBeEnabled();
    expect(screen.getByText(userMessage.content)).toBeInTheDocument();
    expect(beeexyPhase10Api.sendAiConversationMessage).toHaveBeenCalledOnce();
  });

  it("maps request-policy 422 safely and leaves the composer ready for correction", async () => {
    vi.mocked(beeexyPhase10Api.sendAiConversationMessage).mockRejectedValue(new BeeexyApiError(422, {
      problem: {
        errorCode: "ai.conversation.request_not_supported",
        detail: "internal policy expression",
      },
    }));
    render(<AiConversationDetail conversationId={conversationA} />);
    const composer = await screen.findByLabelText("Message Beeexy AI");
    fireEvent.change(composer, { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Try a general health question");
    expect(screen.queryByText("internal policy expression")).not.toBeInTheDocument();
    expect(composer).toHaveValue("Draft");
    expect(composer).toBeEnabled();
  });

  it("locks further sending after the backend message-limit response while preserving read access", async () => {
    vi.mocked(beeexyPhase10Api.sendAiConversationMessage).mockRejectedValue(new BeeexyApiError(422, {
      problem: { errorCode: "ai.conversation.message_limit_reached" },
    }));
    render(<AiConversationDetail conversationId={conversationA} />);
    const composer = await screen.findByLabelText("Message Beeexy AI");
    fireEvent.change(composer, { target: { value: "One more question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/reached its message limit/i);
    expect(composer).toBeDisabled();
    expect(screen.getByText(userMessage.content)).toBeInTheDocument();
  });

  it("shows a safe terminal provider-failure state and refetches persisted history without inventing an answer", async () => {
    vi.mocked(beeexyPhase10Api.sendAiConversationMessage).mockResolvedValue({
      conversationId: conversationA,
      userMessageId: "new-user-message",
      executionId: "failed-execution",
      status: "failed",
      disclaimer,
    });
    vi.mocked(beeexyPhase10Api.getAiConversation)
      .mockResolvedValueOnce(generalDetail)
      .mockResolvedValueOnce({ ...generalDetail, messages: [userMessage] });
    render(<AiConversationDetail conversationId={conversationA} />);
    fireEvent.change(await screen.findByLabelText("Message Beeexy AI"), { target: { value: "Question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText(/couldn’t prepare an AI response/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("article", { name: "Message from Beeexy AI" })).toHaveLength(0);
    expect(beeexyPhase10Api.getAiConversation).toHaveBeenCalledTimes(2);
  });

  it("handles an ambiguous network failure without retrying and retains the draft", async () => {
    vi.mocked(beeexyPhase10Api.sendAiConversationMessage).mockRejectedValue(new BeeexyNetworkError());
    render(<AiConversationDetail conversationId={conversationA} />);
    const composer = await screen.findByLabelText("Message Beeexy AI");
    fireEvent.change(composer, { target: { value: "Uncertain draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t confirm whether the message was received");
    expect(composer).toHaveValue("Uncertain draft");
    expect(beeexyPhase10Api.sendAiConversationMessage).toHaveBeenCalledOnce();
  });

  it("refreshes from the server on demand without mutating or polling", async () => {
    render(<AiConversationDetail conversationId={conversationA} />);
    await screen.findByText(userMessage.content);
    fireEvent.click(screen.getByRole("button", { name: "Refresh conversation" }));
    await waitFor(() => expect(beeexyPhase10Api.getAiConversation).toHaveBeenCalledTimes(2));
    expect(beeexyPhase10Api.sendAiConversationMessage).not.toHaveBeenCalled();
  });

  it("uses one neutral concealed-404 state and never renders ownership details", async () => {
    vi.mocked(beeexyPhase10Api.getAiConversation).mockRejectedValue(new BeeexyApiError(404, {
      problem: { detail: "conversation belongs to another account" },
    }));
    render(<AiConversationDetail conversationId={conversationA} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("may have been removed or your access may have changed");
    expect(screen.queryByText("belongs to another account")).not.toBeInTheDocument();
  });

  it("logically removes detail, navigates to history, and does not refetch the deleted conversation", async () => {
    render(<AiConversationDetail conversationId={conversationA} />);
    await screen.findByText(userMessage.content);
    fireEvent.click(screen.getByRole("button", { name: "Remove conversation from AI History" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from history" }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/ai/conversations"));
    expect(beeexyPhase10Api.deleteAiConversation).toHaveBeenCalledWith(
      conversationA,
      expect.any(AbortSignal),
    );
    expect(beeexyPhase10Api.getAiConversation).toHaveBeenCalledOnce();
  });
});
