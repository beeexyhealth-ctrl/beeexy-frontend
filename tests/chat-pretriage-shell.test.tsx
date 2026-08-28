// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_PATHWAYS,
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
    type: "QUESTION",
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
  it("keeps the exact quick-reply label to canonical pathway mapping", () => {
    expect(CHAT_PATHWAYS).toEqual([
      { code: "HEADACHE", label: "Headache" },
      { code: "ABDOMINAL_PAIN", label: "Stomach pain" },
      { code: "CHEST_PAIN", label: "Chest pain" },
      { code: "FEVER", label: "Fever" },
      { code: "OTHER_SYMPTOMS", label: "Other" },
    ]);
  });

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

  it("maps quick-reply labels to canonical pathways and suppresses duplicate clicks while pending", () => {
    let finish!: () => void;
    const onPathwaySelect = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<ChatPreTriageShell backHref="/home" onComposerSubmit={vi.fn()} onPathwaySelect={onPathwaySelect} />);

    const stomachPain = screen.getByRole("button", { name: /stomach pain/i });
    fireEvent.click(stomachPain);
    fireEvent.click(stomachPain);

    expect(onPathwaySelect).toHaveBeenCalledOnce();
    expect(onPathwaySelect).toHaveBeenCalledWith("ABDOMINAL_PAIN");
    finish();
  });

  it("stages the readable quick-reply turn while deterministic start is pending", () => {
    render(
      <ChatPreTriageShell
        backHref="/home"
        onPathwaySelect={vi.fn()}
        startingPathway="ABDOMINAL_PAIN"
      />,
    );

    expect(screen.getByRole("article", { name: "You" })).toHaveTextContent("Stomach pain");
    expect(screen.getByRole("status")).toHaveTextContent("Processing your response");
    expect(screen.queryByText("ABDOMINAL_PAIN")).not.toBeInTheDocument();
  });

  it("enforces composer keyboard, whitespace, and 4,000-character behavior", () => {
    const onSubmit = vi.fn();
    render(<ChatPreTriageShell backHref="/home" onComposerSubmit={onSubmit} onPathwaySelect={vi.fn()} />);
    const composer = screen.getByLabelText("Describe what you are experiencing");
    const send = screen.getByRole("button", { name: "Send message" });

    expect(composer).toHaveAttribute("maxlength", "4000");
    fireEvent.change(composer, { target: { value: "   " } });
    expect(send).toBeDisabled();

    fireEvent.change(composer, { target: { value: "line one" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    const boundary = "a".repeat(4000);
    fireEvent.change(composer, { target: { value: boundary } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith(boundary);
  });

  it("suppresses duplicate Enter submission while the composer promise is pending", () => {
    let finish!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<ChatPreTriageShell backHref="/home" onComposerSubmit={onSubmit} onPathwaySelect={vi.fn()} />);
    const composer = screen.getByLabelText("Describe what you are experiencing");
    fireEvent.change(composer, { target: { value: "My head hurts" } });

    fireEvent.keyDown(composer, { key: "Enter" });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledOnce();
    finish();
  });

  it("renders ambiguity and unavailable states in-conversation while keeping deterministic choices", () => {
    const onCandidateSelect = vi.fn();
    const onRetry = vi.fn();
    const { rerender } = render(
      <ChatPreTriageShell
        backHref="/home"
        entryState={{ kind: "ambiguous", text: "Pain around here", candidates: ["CHEST_PAIN", "HEADACHE"] }}
        onCandidateSelect={onCandidateSelect}
        onComposerSubmit={vi.fn()}
        onPathwaySelect={vi.fn()}
      />,
    );

    const clarification = screen.getByRole("region", { name: "Clarify the symptom" });
    expect(within(clarification).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Chest pain",
      "Headache",
    ]);
    expect(onCandidateSelect).not.toHaveBeenCalled();
    fireEvent.click(within(clarification).getByRole("button", { name: /chest pain/i }));
    expect(onCandidateSelect).toHaveBeenCalledWith("CHEST_PAIN");

    rerender(
      <ChatPreTriageShell
        backHref="/home"
        entryState={{
          kind: "retryable",
          text: "Pain around here",
          idempotencyKey: "not-rendered",
          reason: "unavailable",
        }}
        onComposerSubmit={vi.fn()}
        onEntryRetry={onRetry}
        onPathwaySelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/can't interpret that description right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/nvidia|nemotron|provider/i)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Choose a symptom" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry description" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows a safe 409 operation conflict without automatically offering same-operation retry", () => {
    const onReset = vi.fn();
    render(
      <ChatPreTriageShell
        backHref="/home"
        entryState={{ kind: "conflict", text: "My head hurts", reason: "key-reused" }}
        onEntryReset={onReset}
        onPathwaySelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Retry description" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start a new description" }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.queryByText("not-rendered")).not.toBeInTheDocument();
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

  it("keeps the natural intake turn intact and renders only the backend next interaction", () => {
    render(
      <ChatPreTriageShell
        backHref="/home"
        onComposerSubmit={vi.fn()}
        projection={projection}
        transientUserTurn="My stomach has hurt for two days and it is a 6 out of 10."
      />,
    );

    expect(screen.getByText("My stomach has hurt for two days and it is a 6 out of 10.")).toBeInTheDocument();
    expect(screen.getByText("Backend supplied this exact additional symptom question")).toBeInTheDocument();
    expect(screen.queryByText("2 days")).not.toBeInTheDocument();
    expect(screen.queryByText("6 out of 10")).not.toBeInTheDocument();
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
