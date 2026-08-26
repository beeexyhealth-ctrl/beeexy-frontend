// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatPreTriageShell,
  type ChatShellError,
} from "@/features/pre-triage-chat/chat-shell";
import type { PreTriageConversationProjection } from "@/lib/beeexy-api/contracts";

const projection: PreTriageConversationProjection = {
  sessionId: "session-1",
  sessionStatus: "ACTIVE",
  state: "IN_PROGRESS",
  expiresAt: "2099-01-01T00:00:00Z",
  pathway: { code: "ABDOMINAL_PAIN", label: "Stomach pain" },
  questionnaire: { code: "abdominal-demo", version: "v1" },
  ruleSet: { code: "neutral-demo", version: "v1" },
  progress: { completed: 2, total: 3, percentage: 67 },
  acceptedValues: {
    duration: { value: 2, unit: "DAYS" },
    intensity: 6,
  },
  nextInteraction: {
    field: "additionalSymptoms",
    questionCode: "ADDITIONAL_SYMPTOMS",
    prompt: "Backend supplied this exact additional symptom question",
    inputType: "MULTI_SELECT",
    required: true,
    constraints: { minimumSelections: 0, maximumSelections: 3, allowsEmptySelection: true },
    options: [
      { value: "NAUSEA", label: "Nausea" },
      { value: "DIARRHEA", label: "Diarrhea" },
      { value: "FEVER", label: "Fever" },
    ],
  },
};

afterEach(cleanup);

describe("Chat Pre-Triage shell", () => {
  it("renders the greeting, exactly five pathway quick replies, and composer shell", () => {
    render(<ChatPreTriageShell backHref="/home" onPathwaySelect={vi.fn()} />);

    expect(screen.getByText("Hi! What are you experiencing today?")).toBeInTheDocument();
    const interaction = screen.getByRole("region", { name: "Choose a symptom" });
    expect(within(interaction).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Headache",
      "Stomach pain",
      "Chest pain",
      "Fever",
      "Other",
    ]);
    expect(screen.getByRole("form", { name: "Message Beeexy" })).toBeInTheDocument();
    expect(screen.getByLabelText("Describe what you are experiencing")).toBeInTheDocument();
  });

  it("renders pathway, backend progress, and the authoritative next interaction without initial choices", () => {
    render(<ChatPreTriageShell backHref="/home" projection={projection} onComposerSubmit={vi.fn()} />);

    expect(screen.getAllByText("Stomach pain").length).toBeGreaterThan(0);
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
    expect(screen.getByText("Backend supplied this exact additional symptom question")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Choose a symptom" })).not.toBeInTheDocument();
  });

  it("does not derive a missing duration question when the backend supplies another interaction", () => {
    render(<ChatPreTriageShell backHref="/home" projection={{ ...projection, acceptedValues: {} }} onComposerSubmit={vi.fn()} />);

    expect(screen.getByText("Backend supplied this exact additional symptom question")).toBeInTheDocument();
    expect(screen.queryByText(/how long/i)).not.toBeInTheDocument();
  });

  it("renders READY_FOR_REVIEW with a handoff and no clinical input", () => {
    render(
      <ChatPreTriageShell
        backHref="/home"
        projection={{ ...projection, state: "READY_FOR_REVIEW", progress: { completed: 3, total: 3, percentage: 100 }, nextInteraction: undefined }}
        reviewHref="/pre-triage/session-1/review"
      />,
    );

    expect(screen.getByText("Your information is ready to review.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review details" })).toHaveAttribute("href", "/pre-triage/session-1/review");
    expect(screen.queryByRole("form", { name: "Message Beeexy" })).not.toBeInTheDocument();
  });

  it("renders COMPLETED as a stable state without clinical input", () => {
    render(
      <ChatPreTriageShell
        backHref="/home"
        projection={{ ...projection, sessionStatus: "COMPLETED", state: "COMPLETED", progress: { completed: 3, total: 3, percentage: 100 }, nextInteraction: undefined }}
        resultHref="/pre-triage/session-1/result"
      />,
    );

    expect(screen.getByText("Your Pre-Triage is complete.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View summary" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Message Beeexy" })).not.toBeInTheDocument();
  });

  it("shows an intentional loading state instead of flashing initial choices", () => {
    render(<ChatPreTriageShell backHref="/home" loading />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading your Pre-Triage conversation");
    expect(screen.queryByText("Hi! What are you experiencing today?")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Choose a symptom" })).not.toBeInTheDocument();
  });

  it("renders a safe retryable error shell", () => {
    const onRetry = vi.fn();
    const error: ChatShellError = {
      title: "We couldn’t load your conversation",
      message: "Check your connection and try again.",
      retryable: true,
    };
    render(<ChatPreTriageShell backHref="/home" error={error} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText(/stack|correlation|token/i)).not.toBeInTheDocument();
  });
});
