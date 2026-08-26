// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPreTriageShell } from "@/features/pre-triage-chat/chat-shell";
import { ConversationInteraction } from "@/features/pre-triage-chat/conversation-interaction";
import { useChatProgression } from "@/features/pre-triage-chat/use-chat-progression";
import type {
  ConversationNextInteraction,
  PreTriageAnswerResponse,
  PreTriageConversationProjection,
  SubmitPreTriageAnswersRequest,
} from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const durationInteraction: Extract<ConversationNextInteraction, { inputType: "DURATION" }> = {
  field: "duration",
  questionCode: "DURATION",
  prompt: "How long has this been happening?",
  inputType: "DURATION",
  required: true,
  constraints: { minimum: 0, exclusiveMinimum: true, allowedUnits: ["HOURS", "DAYS"] },
  options: [],
};

const scaleInteraction: Extract<ConversationNextInteraction, { inputType: "SCALE" }> = {
  field: "intensity",
  questionCode: "INTENSITY",
  prompt: "Choose the intensity.",
  inputType: "SCALE",
  required: true,
  constraints: { minimum: 1, maximum: 7, step: 2 },
  options: [],
};

const multiInteraction: Extract<ConversationNextInteraction, { inputType: "MULTI_SELECT" }> = {
  field: "additionalSymptoms",
  questionCode: "ADDITIONAL_SYMPTOMS",
  prompt: "Select any additional symptoms.",
  inputType: "MULTI_SELECT",
  required: true,
  constraints: { minimumSelections: 0, maximumSelections: 2, allowsEmptySelection: true },
  options: [
    { value: "NAUSEA", label: "Feeling nauseated" },
    { value: "DIARRHEA", label: "Loose stools" },
    { value: "FEVER", label: "High temperature" },
  ],
};

function projection(
  interaction: ConversationNextInteraction | null = multiInteraction,
  overrides: Partial<PreTriageConversationProjection> = {},
): PreTriageConversationProjection {
  return {
    sessionId: "session-1",
    sessionStatus: "ACTIVE",
    state: interaction ? "IN_PROGRESS" : "READY_FOR_REVIEW",
    expiresAt: "2099-01-01T00:00:00Z",
    pathway: { code: "ABDOMINAL_PAIN", label: "Stomach pain" },
    questionnaire: { code: "abdominal-demo", version: "v1" },
    ruleSet: { code: "neutral-demo", version: "v1" },
    progress: { completed: 0, total: 3, percentage: 0 },
    acceptedValues: {},
    nextInteraction: interaction || undefined,
    ...overrides,
  };
}

function answerResponse(conversation: PreTriageConversationProjection): PreTriageAnswerResponse {
  return {
    sessionId: conversation.sessionId,
    pathway: conversation.pathway.code,
    questionnaireVersion: conversation.questionnaire.version,
    outcome: "ACCEPTED",
    acceptedAnswers: [],
    acceptedValues: conversation.acceptedValues,
    progression: {
      state: conversation.state === "IN_PROGRESS" ? "IN_PROGRESS" : "READY_TO_COMPLETE",
      answeredRequiredFields: [],
      missingRequiredFields: [],
      readyToComplete: conversation.state !== "IN_PROGRESS",
    },
    conversation,
  };
}

afterEach(cleanup);

describe("projected conversation interaction controls", () => {
  it("renders DURATION from projected constraints and submits only the structured duration field", () => {
    const onSubmit = vi.fn();
    render(<ConversationInteraction interaction={durationInteraction} onSubmit={onSubmit} />);

    const value = screen.getByLabelText("Duration");
    const unit = screen.getByLabelText("Unit");
    expect(value).toHaveAttribute("min", "0");
    expect(within(unit).getAllByRole("option").map((option) => option.textContent)).toEqual(["Hours", "Days"]);

    fireEvent.change(value, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(value, { target: { value: "2.5" } });
    fireEvent.change(unit, { target: { value: "DAYS" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSubmit).toHaveBeenCalledWith(durationInteraction, { duration: { value: 2.5, unit: "DAYS" } });
  });

  it("renders SCALE from projected min, max, and step and submits the visible selected number", () => {
    const onSubmit = vi.fn();
    render(<ConversationInteraction interaction={scaleInteraction} onSubmit={onSubmit} />);
    const range = screen.getByRole("slider", { name: "Select a value" });

    expect(range).toHaveAttribute("min", "1");
    expect(range).toHaveAttribute("max", "7");
    expect(range).toHaveAttribute("step", "2");
    fireEvent.change(range, { target: { value: "5" } });
    expect(screen.getByText("5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSubmit).toHaveBeenCalledWith(scaleInteraction, { intensity: 5 });
  });

  it("uses projected MULTI_SELECT labels, enforces the maximum, and maps None to an empty array", () => {
    const onSubmit = vi.fn();
    render(<ConversationInteraction interaction={multiInteraction} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: /feeling nauseated/i }));
    fireEvent.click(screen.getByRole("button", { name: /loose stools/i }));
    fireEvent.click(screen.getByRole("button", { name: /high temperature/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose no more than 2");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSubmit).toHaveBeenLastCalledWith(multiInteraction, { additionalSymptoms: ["NAUSEA", "DIARRHEA"] });

    fireEvent.click(screen.getByRole("button", { name: /^none/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSubmit).toHaveBeenLastCalledWith(multiInteraction, { additionalSymptoms: [] });
    expect(JSON.stringify(onSubmit.mock.calls)).not.toContain("NONE");
  });

  it("omits None unless the backend permits an empty selection", () => {
    render(
      <ConversationInteraction
        interaction={{ ...multiInteraction, constraints: { ...multiInteraction.constraints, allowsEmptySelection: false, minimumSelections: 1 } }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^none/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("fails safely for an unknown runtime input type", () => {
    render(
      <ConversationInteraction
        interaction={{ ...durationInteraction, inputType: "DATE" } as unknown as ConversationNextInteraction}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("isn't available");
  });

  it("renders the backend-selected interaction without deriving clinical order", () => {
    render(<ChatPreTriageShell backHref="/home" projection={projection(multiInteraction)} onStructuredSubmit={vi.fn()} />);
    expect(screen.getByText(multiInteraction.prompt)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Answer symptom options" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Message Beeexy" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Duration")).not.toBeInTheDocument();
  });

  it("blocks blind answer retry when the canonical recovery check failed", () => {
    render(
      <ChatPreTriageShell
        backHref="/home"
        projection={projection()}
        progressionState={{ kind: "recovery-failed", message: "Check before retrying." }}
        onProgressionRecoveryRetry={vi.fn()}
        onStructuredSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /feeling nauseated/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check conversation" })).toBeEnabled();
  });

  it("uses the same renderer for every authoritative pathway", () => {
    const pathways = ["HEADACHE", "ABDOMINAL_PAIN", "CHEST_PAIN", "FEVER", "OTHER_SYMPTOMS"] as const;
    const { rerender } = render(<ChatPreTriageShell backHref="/home" projection={projection()} />);
    for (const pathway of pathways) {
      rerender(
        <ChatPreTriageShell
          backHref="/home"
          projection={projection(multiInteraction, { pathway: { code: pathway, label: `Backend ${pathway}` } })}
        />,
      );
      expect(screen.getByRole("form", { name: "Answer symptom options" })).toBeInTheDocument();
      expect(screen.getAllByText(`Backend ${pathway}`).length).toBeGreaterThan(0);
    }
  });

  it("keeps accepted canonical values visible after an intake turn without duplicating its initial fields", () => {
    const initial = projection(multiInteraction, {
      acceptedValues: { duration: { value: 2, unit: "DAYS" }, intensity: 5 },
      progress: { completed: 2, total: 3, percentage: 67 },
    });
    const { rerender } = render(
      <ChatPreTriageShell
        backHref="/home"
        projection={initial}
        transientUserTurn="It has hurt for two days at five out of ten."
      />,
    );
    expect(screen.queryByText("2 days")).not.toBeInTheDocument();
    expect(screen.queryByText("5 out of 10")).not.toBeInTheDocument();

    rerender(
      <ChatPreTriageShell
        backHref="/home"
        projection={projection(scaleInteraction, {
          acceptedValues: { duration: { value: 2, unit: "DAYS" }, intensity: 5, additionalSymptoms: ["NAUSEA"] },
          progress: { completed: 3, total: 4, percentage: 75 },
        })}
        transientUserTurn="It has hurt for two days at five out of ten."
      />,
    );
    expect(screen.getByText("Nausea")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});

function ProgressionHarness({
  current = projection(),
  recoverConversation,
  submitAnswer,
}: {
  current?: PreTriageConversationProjection;
  recoverConversation: (sessionId: string, signal?: AbortSignal) => Promise<PreTriageConversationProjection>;
  submitAnswer: (request: SubmitPreTriageAnswersRequest, signal?: AbortSignal) => Promise<PreTriageAnswerResponse>;
}) {
  const progression = useChatProgression({ projection: current, recoverConversation, submitAnswer });
  return (
    <div>
      <p data-testid="state">{progression.state.kind}</p>
      <button type="button" onClick={() => void progression.submit(current.nextInteraction!, { additionalSymptoms: [] })}>Submit projected answer</button>
      <button type="button" onClick={() => void progression.retryAnswer()}>Retry exact answer</button>
      <button type="button" onClick={() => void progression.retryRecovery()}>Retry recovery</button>
    </div>
  );
}

function StaleInteractionHarness({
  current,
  recoverConversation,
  submitAnswer,
}: {
  current: PreTriageConversationProjection;
  recoverConversation: (sessionId: string, signal?: AbortSignal) => Promise<PreTriageConversationProjection>;
  submitAnswer: (request: SubmitPreTriageAnswersRequest, signal?: AbortSignal) => Promise<PreTriageAnswerResponse>;
}) {
  const progression = useChatProgression({ projection: current, recoverConversation, submitAnswer });
  return (
    <button type="button" onClick={() => void progression.submit(durationInteraction, { duration: { value: 2, unit: "DAYS" } })}>
      Submit stale duration
    </button>
  );
}

function SequentialHarness({ submitSpy }: { submitSpy: (request: SubmitPreTriageAnswersRequest) => void }) {
  const [current, setCurrent] = useState(projection(durationInteraction, {
    progress: { completed: 0, total: 3, percentage: 33 },
  }));
  async function submitAnswer(request: SubmitPreTriageAnswersRequest) {
    submitSpy(request);
    let next: PreTriageConversationProjection;
    if (request.structured?.duration) {
      next = projection(scaleInteraction, {
        acceptedValues: request.structured,
        progress: { completed: 1, total: 3, percentage: 67 },
      });
    } else if (request.structured?.intensity !== undefined) {
      next = projection(multiInteraction, {
        acceptedValues: { duration: { value: 2, unit: "DAYS" }, intensity: request.structured.intensity },
        progress: { completed: 2, total: 3, percentage: 67 },
      });
    } else {
      next = projection(null, {
        acceptedValues: {
          duration: { value: 2, unit: "DAYS" },
          intensity: 5,
          additionalSymptoms: request.structured?.additionalSymptoms,
        },
        progress: { completed: 3, total: 3, percentage: 100 },
      });
    }
    setCurrent(next);
    return answerResponse(next);
  }
  const progression = useChatProgression({
    projection: current,
    recoverConversation: vi.fn(),
    submitAnswer,
  });
  return (
    <ChatPreTriageShell
      backHref="/home"
      onProgressionRecoveryRetry={progression.retryRecovery}
      onProgressionRetry={progression.retryAnswer}
      onStructuredSubmit={progression.submit}
      progressionState={progression.state}
      projection={current}
      reviewHref="/pre-triage/session-1/review"
    />
  );
}

describe("conversation answer orchestration", () => {
  it("suppresses duplicate submissions synchronously", () => {
    let resolve!: (value: PreTriageAnswerResponse) => void;
    const submitAnswer = vi.fn(() => new Promise<PreTriageAnswerResponse>((done) => { resolve = done; }));
    render(<ProgressionHarness recoverConversation={vi.fn()} submitAnswer={submitAnswer} />);
    const submit = screen.getByRole("button", { name: "Submit projected answer" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(submitAnswer).toHaveBeenCalledOnce();
    resolve(answerResponse(projection(null)));
  });

  it("keeps a projected question available with a safe inline state after 422", async () => {
    const submitAnswer = vi.fn().mockRejectedValue(new BeeexyApiError(422, {
      problem: { errorCode: "pre_triage.additional_symptoms_invalid", detail: "private backend detail" },
    }));
    render(<ProgressionHarness recoverConversation={vi.fn()} submitAnswer={submitAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit projected answer" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("validation"));
    expect(screen.queryByText("private backend detail")).not.toBeInTheDocument();
  });

  it("rejects a stale interaction object before making a request", () => {
    const submitAnswer = vi.fn();
    render(
      <StaleInteractionHarness
        current={projection(scaleInteraction)}
        recoverConversation={vi.fn()}
        submitAnswer={submitAnswer}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit stale duration" }));
    expect(submitAnswer).not.toHaveBeenCalled();
  });

  it("rechecks after an uncertain failure and treats an advanced projection as accepted", async () => {
    const submitAnswer = vi.fn().mockRejectedValue(new BeeexyNetworkError());
    const recoverConversation = vi.fn().mockResolvedValue(projection(null, {
      progress: { completed: 3, total: 3, percentage: 100 },
    }));
    render(<ProgressionHarness recoverConversation={recoverConversation} submitAnswer={submitAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit projected answer" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("idle"));
    expect(recoverConversation).toHaveBeenCalledOnce();
    expect(submitAnswer).toHaveBeenCalledOnce();
  });

  it("offers an explicit exact retry only after recovery confirms the same interaction", async () => {
    const submitAnswer = vi.fn()
      .mockRejectedValueOnce(new BeeexyApiError(503))
      .mockResolvedValueOnce(answerResponse(projection(null)));
    const recoverConversation = vi.fn().mockResolvedValue(projection());
    render(<ProgressionHarness recoverConversation={recoverConversation} submitAnswer={submitAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit projected answer" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("retryable"));
    fireEvent.click(screen.getByRole("button", { name: "Retry exact answer" }));
    await waitFor(() => expect(submitAnswer).toHaveBeenCalledTimes(2));
    expect(submitAnswer.mock.calls[0][0]).toEqual({ structured: { additionalSymptoms: [] } });
    expect(submitAnswer.mock.calls[1][0]).toEqual(submitAnswer.mock.calls[0][0]);
  });

  it("retries only the projection check when recovery itself fails", async () => {
    const submitAnswer = vi.fn().mockRejectedValue(new BeeexyNetworkError());
    const recoverConversation = vi.fn()
      .mockRejectedValueOnce(new BeeexyNetworkError())
      .mockResolvedValueOnce(projection());
    render(<ProgressionHarness recoverConversation={recoverConversation} submitAnswer={submitAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit projected answer" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("recovery-failed"));
    fireEvent.click(screen.getByRole("button", { name: "Retry recovery" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("retryable"));
    expect(recoverConversation).toHaveBeenCalledTimes(2);
    expect(submitAnswer).toHaveBeenCalledOnce();
  });

  it("follows each returned projection through an unusual backend-defined sequence", async () => {
    const submitSpy = vi.fn();
    render(<SequentialHarness submitSpy={submitSpy} />);
    expect(screen.getByText("33%")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Duration"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "DAYS" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("slider", { name: "Select a value" });
    expect(screen.getByText("67%")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("form", { name: "Answer symptom options" });
    fireEvent.click(screen.getByRole("button", { name: /feeling nauseated/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("link", { name: "Review details" })).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Feeling nauseated")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /answer/i })).not.toBeInTheDocument();
    expect(submitSpy.mock.calls.map(([request]) => request)).toEqual([
      { structured: { duration: { value: 2, unit: "DAYS" } } },
      { structured: { intensity: 5 } },
      { structured: { additionalSymptoms: ["NAUSEA"] } },
    ]);
  });
});
