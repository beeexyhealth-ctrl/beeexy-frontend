// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreTriageConversationProjection } from "@/lib/beeexy-api/contracts";

const route = vi.hoisted(() => ({ sessionId: "session-a" }));
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const auth = vi.hoisted(() => ({ status: "unauthenticated" }));
const provider = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ sessionId: route.sessionId }),
  useRouter: () => navigation,
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("@/features/my-circle/patient-provider", () => ({
  usePatients: () => ({
    activePatient: null,
    bootstrapStatus: "ready",
    patients: [],
    selectActivePatient: vi.fn(),
  }),
}));
vi.mock("@/features/pre-triage/pre-triage-provider", () => ({ usePreTriage: () => provider.value }));

import {
  PreTriageChatSessionScreen,
  PreTriageChatStartScreen,
} from "@/features/pre-triage-chat/pre-triage-chat-screen";

function conversationProjection(
  sessionId: string,
  code: PreTriageConversationProjection["pathway"]["code"] = "HEADACHE",
  label = "Headache",
): PreTriageConversationProjection {
  return {
    sessionId,
    sessionStatus: "ACTIVE",
    state: "IN_PROGRESS",
    expiresAt: "2099-01-01T00:00:00Z",
    pathway: { code, label },
    questionnaire: { code: "headache-demo", version: "v1" },
    ruleSet: { code: "neutral-demo", version: "v1" },
    progress: { completed: 0, total: 3, percentage: 0 },
    acceptedValues: {},
    nextInteraction: {
      type: "QUESTION",
      field: "duration",
      questionCode: "DURATION",
      prompt: "How long ago did it start?",
      inputType: "DURATION",
      required: true,
      constraints: { minimum: 0, exclusiveMinimum: true, allowedUnits: ["HOURS"] },
      options: [],
    },
  };
}

const projection = conversationProjection("session-b");

function activeConversation(conversation: PreTriageConversationProjection) {
  return {
    sessionId: conversation.sessionId,
    mode: "anonymous",
    pathway: conversation.pathway.code,
    questionnaireVersion: conversation.questionnaire.version,
    expiresAt: conversation.expiresAt,
    progression: { state: "IN_PROGRESS", readyToComplete: false, nextRequiredAnswer: null },
    conversation,
    acceptedAnswers: conversation.acceptedValues,
    pendingClaim: false,
  };
}

function abortablePending(signal?: AbortSignal) {
  return new Promise<never>((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

beforeEach(() => {
  route.sessionId = "session-a";
  auth.status = "unauthenticated";
  navigation.push.mockReset();
  navigation.replace.mockReset();
  provider.value = {
    abandon: vi.fn(),
    active: null,
    clearError: vi.fn(),
    error: null,
    hydrated: true,
    loadConversation: vi.fn(),
    operation: null,
    start: vi.fn(),
    startFromIntake: vi.fn(),
    submit: vi.fn(),
  };
});

afterEach(cleanup);

describe("Part 9B stale request acceptance", () => {
  it.each([
    ["Headache", "HEADACHE"],
    ["Stomach pain", "ABDOMINAL_PAIN"],
    ["Chest pain", "CHEST_PAIN"],
    ["Fever", "FEVER"],
    ["Other", "OTHER_SYMPTOMS"],
  ] as const)("takes the %s quick reply through session creation to the ready canonical conversation", async (label, pathway) => {
    const sessionId = `session-${pathway.toLowerCase()}`;
    const canonical = conversationProjection(sessionId, pathway, label);
    provider.value.start = vi.fn().mockResolvedValue(activeConversation(canonical));
    const startView = render(<PreTriageChatStartScreen />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(label, "i") }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith(`/pre-triage/${sessionId}`));
    expect(provider.value.start).toHaveBeenCalledWith(pathway, "anonymous", null, expect.any(AbortSignal));

    startView.unmount();
    route.sessionId = sessionId;
    const redundantLoad = vi.fn();
    provider.value = {
      ...provider.value,
      active: activeConversation(canonical),
      loadConversation: redundantLoad,
    };
    render(<PreTriageChatSessionScreen />);

    expect(await screen.findByText("How long ago did it start?")).toBeInTheDocument();
    expect(redundantLoad).not.toHaveBeenCalled();
  });

  it("aborts a deterministic quick-reply start when its screen is left", async () => {
    let startSignal: AbortSignal | undefined;
    provider.value.start = vi.fn((...args: unknown[]) => {
      startSignal = args[3] as AbortSignal;
      return abortablePending(startSignal);
    });
    const view = render(<PreTriageChatStartScreen />);

    fireEvent.click(screen.getByRole("button", { name: /headache/i }));
    expect(provider.value.start).toHaveBeenCalledOnce();
    expect(startSignal?.aborted).toBe(false);

    view.unmount();
    expect(startSignal?.aborted).toBe(true);
    await Promise.resolve();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("becomes ready when the provider active transition changes the callback before the scheduled restore runs", async () => {
    const firstLoad = vi.fn();
    provider.value.loadConversation = firstLoad;
    const view = render(<PreTriageChatSessionScreen />);

    const canonical = conversationProjection("session-a");
    const replacementLoad = vi.fn();
    provider.value = {
      ...provider.value,
      active: activeConversation(canonical),
      loadConversation: replacementLoad,
    };
    view.rerender(<PreTriageChatSessionScreen />);

    expect(await screen.findByText("How long ago did it start?")).toBeInTheDocument();
    expect(firstLoad).not.toHaveBeenCalled();
    expect(replacementLoad).not.toHaveBeenCalled();
  });

  it("loads the canonical conversation once for a direct session route without a projection", async () => {
    let resolveConversation!: (value: PreTriageConversationProjection) => void;
    const loadConversation = vi.fn(() => new Promise<PreTriageConversationProjection>((resolve) => {
      resolveConversation = resolve;
    }));
    provider.value.loadConversation = loadConversation;
    const view = render(<PreTriageChatSessionScreen />);

    await waitFor(() => expect(loadConversation).toHaveBeenCalledWith("session-a", expect.any(AbortSignal)));
    const canonical = conversationProjection("session-a");
    const replacementLoad = vi.fn();
    provider.value = {
      ...provider.value,
      active: activeConversation(canonical),
      loadConversation: replacementLoad,
    };
    resolveConversation(canonical);
    view.rerender(<PreTriageChatSessionScreen />);

    expect(await screen.findByText("How long ago did it start?")).toBeInTheDocument();
    expect(loadConversation).toHaveBeenCalledOnce();
    expect(replacementLoad).not.toHaveBeenCalled();
  });

  it("aborts session A restoration and binds the next read to session B", async () => {
    const signals: AbortSignal[] = [];
    provider.value.loadConversation = vi.fn((sessionId: string, signal: AbortSignal) => {
      signals.push(signal);
      if (sessionId === "session-b") return Promise.resolve(projection);
      return abortablePending(signal);
    });
    const view = render(<PreTriageChatSessionScreen />);
    await waitFor(() => expect(provider.value.loadConversation).toHaveBeenCalledWith("session-a", expect.any(AbortSignal)));

    route.sessionId = "session-b";
    view.rerender(<PreTriageChatSessionScreen />);

    await waitFor(() => expect(provider.value.loadConversation).toHaveBeenCalledWith("session-b", expect.any(AbortSignal)));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });
});
