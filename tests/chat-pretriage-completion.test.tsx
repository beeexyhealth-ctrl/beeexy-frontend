// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NeutralPreTriageResult,
  PreTriageConversationProjection,
} from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const provider = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ sessionId: "session-1" }),
  useRouter: () => navigation,
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ status: "authenticated" }),
}));
vi.mock("@/features/pre-triage/pre-triage-provider", () => ({
  usePreTriage: () => provider.value,
}));

import { PreTriageReviewScreen, PreTriageReviewSummary } from "@/features/pre-triage/pre-triage-flow";
import { useChatCompletion } from "@/features/pre-triage-chat/use-chat-completion";

const readyProjection: PreTriageConversationProjection = {
  sessionId: "session-1",
  sessionStatus: "ACTIVE",
  state: "READY_FOR_REVIEW",
  expiresAt: "2099-01-01T00:00:00Z",
  pathway: { code: "ABDOMINAL_PAIN", label: "Stomach pain" },
  questionnaire: { code: "abdominal-demo", version: "v1" },
  ruleSet: { code: "neutral-demo", version: "v1" },
  progress: { completed: 3, total: 3, percentage: 100 },
  acceptedValues: {
    duration: { value: 2, unit: "DAYS" },
    intensity: 6,
    additionalSymptoms: ["NAUSEA"],
  },
};

const completedProjection: PreTriageConversationProjection = {
  ...readyProjection,
  sessionStatus: "COMPLETED",
  state: "COMPLETED",
};

const result: NeutralPreTriageResult = {
  sessionId: "session-1",
  episodeId: "episode-1",
  primarySymptom: { code: "ABDOMINAL_PAIN", display: "Stomach pain" },
  duration: { value: 2, unit: "DAYS" },
  intensity: 6,
  additionalSymptoms: ["NAUSEA"],
  completedAt: "2026-08-22T12:05:00Z",
  questionnaire: { code: "abdominal-demo", version: "v1" },
  package: { code: "neutral-demo", version: "v1" },
  clinicalContent: {
    source: "PRODUCT_DEMO_DEFINED",
    reviewStatus: "NOT_APPLICABLE",
    clinicalApproval: "NOT_CLINICALLY_APPROVED",
  },
};

function activeWithProjection(projection: PreTriageConversationProjection) {
  return {
    sessionId: projection.sessionId,
    mode: "authenticated",
    pathway: projection.pathway.code,
    questionnaireVersion: projection.questionnaire.version,
    expiresAt: projection.expiresAt,
    progression: {
      state: "READY_TO_COMPLETE",
      answeredRequiredFields: ["DURATION", "INTENSITY", "ADDITIONAL_SYMPTOMS"],
      missingRequiredFields: [],
      readyToComplete: true,
    },
    conversation: projection,
    acceptedAnswers: projection.acceptedValues,
    pendingClaim: false,
  };
}

function configureProvider(overrides: Record<string, unknown> = {}) {
  provider.value = {
    active: activeWithProjection(readyProjection),
    complete: vi.fn().mockResolvedValue(result),
    error: null,
    hydrated: true,
    loadConversation: vi.fn().mockResolvedValue(readyProjection),
    ...overrides,
  };
}

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  configureProvider();
});

afterEach(cleanup);

describe("Part 8 authoritative review", () => {
  it("renders accepted projection values with readable labels and no transcript dependency", () => {
    render(<PreTriageReviewSummary projection={readyProjection} />);
    expect(screen.getByText("Stomach pain")).toBeInTheDocument();
    expect(screen.getByText("2 days")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Nausea")).toBeInTheDocument();
    expect(screen.queryByText(/ABDOMINAL_PAIN|NAUSEA/)).not.toBeInTheDocument();
  });

  it("shows READY_FOR_REVIEW without automatically completing", () => {
    render(<PreTriageReviewScreen />);
    expect(screen.getByText("Thanks. Your information is ready to review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete Pre-Triage" })).toBeEnabled();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(provider.value.complete).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: /answer/i })).not.toBeInTheDocument();
  });

  it("requires explicit completion, suppresses rapid duplicates, and keeps Review visible while pending", async () => {
    let resolve!: (value: NeutralPreTriageResult) => void;
    const complete = vi.fn(() => new Promise<NeutralPreTriageResult>((done) => { resolve = done; }));
    configureProvider({ complete });
    render(<PreTriageReviewScreen />);
    const button = screen.getByRole("button", { name: "Complete Pre-Triage" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(complete).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Completing..." })).toBeDisabled();
    expect(screen.getByText("Review your information")).toBeInTheDocument();
    expect(screen.queryByText(/Pre-Triage has been completed/i)).not.toBeInTheDocument();

    resolve(result);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/pre-triage/session-1/result"));
  });

  it("restores COMPLETED by routing to the canonical result without another completion", async () => {
    const complete = vi.fn();
    configureProvider({ active: activeWithProjection(completedProjection), complete });
    render(<PreTriageReviewScreen />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/pre-triage/session-1/result"));
    expect(complete).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Complete Pre-Triage" })).not.toBeInTheDocument();
  });

  it("loads the canonical projection on Review refresh and never auto-completes", async () => {
    const complete = vi.fn();
    const loadConversation = vi.fn().mockResolvedValue(readyProjection);
    configureProvider({ active: null, complete, loadConversation });
    render(<PreTriageReviewScreen />);
    await waitFor(() => expect(loadConversation).toHaveBeenCalledWith("session-1"));
    expect(complete).not.toHaveBeenCalled();
  });
});

function CompletionHarness({
  completeSession,
  current = readyProjection,
  recoverConversation,
}: {
  completeSession: (signal?: AbortSignal) => Promise<NeutralPreTriageResult>;
  current?: PreTriageConversationProjection;
  recoverConversation: (sessionId: string, signal?: AbortSignal) => Promise<PreTriageConversationProjection>;
}) {
  const completion = useChatCompletion({ completeSession, projection: current, recoverConversation });
  return (
    <div>
      <p data-testid="state">{completion.state.kind}</p>
      <button type="button" onClick={() => void completion.complete()}>Complete</button>
      <button type="button" onClick={() => void completion.retryCompletion()}>Retry completion</button>
      <button type="button" onClick={() => void completion.retryRecovery()}>Retry recovery</button>
    </div>
  );
}

describe("Part 8 completion recovery", () => {
  it("treats a recovered COMPLETED projection as success after network uncertainty", async () => {
    const completeSession = vi.fn().mockRejectedValue(new BeeexyNetworkError());
    const recoverConversation = vi.fn().mockResolvedValue(completedProjection);
    render(<CompletionHarness completeSession={completeSession} recoverConversation={recoverConversation} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("completed"));
    expect(completeSession).toHaveBeenCalledOnce();
    expect(recoverConversation).toHaveBeenCalledOnce();
  });

  it("allows explicit retry only after recovery confirms READY_FOR_REVIEW", async () => {
    const completeSession = vi.fn()
      .mockRejectedValueOnce(new BeeexyApiError(500))
      .mockResolvedValueOnce(result);
    const recoverConversation = vi.fn().mockResolvedValue(readyProjection);
    render(<CompletionHarness completeSession={completeSession} recoverConversation={recoverConversation} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("retryable"));
    expect(completeSession).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Retry completion" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("completed"));
    expect(completeSession).toHaveBeenCalledTimes(2);
  });

  it("retries only recovery when canonical status could not be checked", async () => {
    const completeSession = vi.fn().mockRejectedValue(new BeeexyNetworkError());
    const recoverConversation = vi.fn()
      .mockRejectedValueOnce(new BeeexyNetworkError())
      .mockResolvedValueOnce(readyProjection);
    render(<CompletionHarness completeSession={completeSession} recoverConversation={recoverConversation} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("recovery-failed"));
    fireEvent.click(screen.getByRole("button", { name: "Retry recovery" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("retryable"));
    expect(recoverConversation).toHaveBeenCalledTimes(2);
    expect(completeSession).toHaveBeenCalledOnce();
  });

  it("reconciles validation without forcing a completed state", async () => {
    const completeSession = vi.fn().mockRejectedValue(new BeeexyApiError(422, {
      problem: { errorCode: "pre_triage.completion_incomplete", detail: "internal detail" },
    }));
    const recoverConversation = vi.fn().mockResolvedValue(readyProjection);
    render(<CompletionHarness completeSession={completeSession} recoverConversation={recoverConversation} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("validation"));
    expect(screen.queryByText("internal detail")).not.toBeInTheDocument();
    expect(recoverConversation).toHaveBeenCalledOnce();
  });

  it("reconciles a completion conflict before offering an explicit retry", async () => {
    const completeSession = vi.fn().mockRejectedValue(new BeeexyApiError(409));
    const recoverConversation = vi.fn().mockResolvedValue(readyProjection);
    render(<CompletionHarness completeSession={completeSession} recoverConversation={recoverConversation} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("retryable"));
    expect(completeSession).toHaveBeenCalledOnce();
    expect(recoverConversation).toHaveBeenCalledOnce();
  });
});
