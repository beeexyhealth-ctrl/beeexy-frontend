// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatIntake } from "@/features/pre-triage-chat/use-chat-intake";
import type { StartPreTriageFromIntakeResponse } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

type ExecuteIntake = (
  text: string,
  idempotencyKey: string,
  signal: AbortSignal,
) => Promise<StartPreTriageFromIntakeResponse>;

const resolved: Extract<StartPreTriageFromIntakeResponse, { resolution: "RESOLVED" }> = {
  resolution: "RESOLVED",
  session: {
    sessionId: "session-canonical",
    patientId: "patient-1",
    pathway: "ABDOMINAL_PAIN",
    status: "Active",
    expiresAt: "2099-01-01T00:00:00Z",
    questionnaire: { code: "abdominal-demo", version: "v1" },
    ruleSet: { code: "neutral-demo", version: "v1" },
    clinicalContent: {
      source: "PRODUCT_DEMO_DEFINED",
      reviewStatus: "NOT_APPLICABLE",
      clinicalApproval: "NOT_CLINICALLY_APPROVED",
    },
  },
  initialAnswers: {
    sessionId: "session-canonical",
    pathway: "ABDOMINAL_PAIN",
    questionnaireVersion: "v1",
    outcome: "ACCEPTED",
    acceptedAnswers: ["DURATION", "INTENSITY"],
    acceptedValues: { duration: { value: 2, unit: "DAYS" }, intensity: 6 },
    progression: {
      state: "IN_PROGRESS",
      answeredRequiredFields: ["DURATION", "INTENSITY"],
      missingRequiredFields: ["ADDITIONAL_SYMPTOMS"],
      nextQuestion: {
        code: "ADDITIONAL_SYMPTOMS",
        prompt: "Backend prompt",
        answerType: "MULTIPLE_CHOICE",
        allowedValues: ["NAUSEA"],
        allowedUnits: [],
        minimum: 0,
        maximum: 1,
      },
      readyToComplete: false,
    },
  },
  conversation: {
    sessionId: "session-canonical",
    sessionStatus: "ACTIVE",
    state: "IN_PROGRESS",
    expiresAt: "2099-01-01T00:00:00Z",
    pathway: { code: "ABDOMINAL_PAIN", label: "Stomach pain" },
    questionnaire: { code: "abdominal-demo", version: "v1" },
    ruleSet: { code: "neutral-demo", version: "v1" },
    progress: { completed: 2, total: 3, percentage: 67 },
    acceptedValues: { duration: { value: 2, unit: "DAYS" }, intensity: 6 },
    nextInteraction: {
      field: "additionalSymptoms",
      questionCode: "ADDITIONAL_SYMPTOMS",
      prompt: "Backend prompt",
      inputType: "MULTI_SELECT",
      required: true,
      constraints: { minimumSelections: 0, maximumSelections: 1, allowsEmptySelection: true },
      options: [{ value: "NAUSEA", label: "Nausea" }],
    },
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function IntakeHarness({
  execute,
  onResolved = vi.fn(),
}: {
  execute: ExecuteIntake;
  onResolved?: (response: Extract<StartPreTriageFromIntakeResponse, { resolution: "RESOLVED" }>) => void;
}) {
  const intake = useChatIntake({ execute, onResolved });
  return (
    <div>
      <output aria-label="state">{intake.state.kind}</output>
      {intake.state.kind === "ambiguous" && <output aria-label="candidates">{intake.state.candidates.join(",")}</output>}
      <button type="button" onClick={() => void intake.submit("My stomach hurts")}>Submit A</button>
      <button type="button" onClick={() => void intake.submit("My head hurts")}>Submit B</button>
      <button type="button" onClick={() => void intake.submit("   ")}>Submit whitespace</button>
      <button type="button" onClick={() => void intake.submit("x".repeat(4001))}>Submit over limit</button>
      <button type="button" onClick={() => void intake.retry()}>Retry</button>
      <button type="button" onClick={intake.reset}>Reset</button>
    </div>
  );
}

function stubRandomKeys(...keys: string[]) {
  const randomUUID = vi.fn();
  keys.forEach((key) => randomUUID.mockReturnValueOnce(key));
  vi.stubGlobal("crypto", { randomUUID });
  return randomUUID;
}

describe("Chat Pre-Triage intake operation", () => {
  it("blocks whitespace-only and over-4,000-character logical submissions before key generation", () => {
    const randomUUID = stubRandomKeys("11111111-1111-4111-8111-111111111111");
    const execute = vi.fn<ExecuteIntake>();
    render(<IntakeHarness execute={execute} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit whitespace" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit over limit" }));

    expect(execute).not.toHaveBeenCalled();
    expect(randomUUID).not.toHaveBeenCalled();
    expect(screen.getByLabelText("state")).toHaveTextContent("idle");
  });

  it("reuses the same random key and identical text after a lost response, then adopts the replayed canonical session", async () => {
    const key = "11111111-1111-4111-8111-111111111111";
    stubRandomKeys(key);
    const execute = vi.fn<ExecuteIntake>()
      .mockRejectedValueOnce(new BeeexyNetworkError())
      .mockResolvedValueOnce(resolved);
    const onResolved = vi.fn();
    render(<IntakeHarness execute={execute} onResolved={onResolved} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit A" }));
    expect(await screen.findByText("retryable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("resolved")).toBeInTheDocument();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.map(([text, idempotencyKey]) => [text, idempotencyKey])).toEqual([
      ["My stomach hurts", key],
      ["My stomach hurts", key],
    ]);
    expect(onResolved).toHaveBeenCalledWith(resolved);
  });

  it("uses a new key only for a genuinely new description after UNRESOLVED", async () => {
    const firstKey = "11111111-1111-4111-8111-111111111111";
    const secondKey = "22222222-2222-4222-8222-222222222222";
    stubRandomKeys(firstKey, secondKey);
    const execute = vi.fn<ExecuteIntake>()
      .mockResolvedValueOnce({ resolution: "UNRESOLVED" })
      .mockResolvedValueOnce({ resolution: "UNRESOLVED" });
    render(<IntakeHarness execute={execute} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit A" }));
    expect(await screen.findByText("unresolved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit B" }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));

    expect(execute.mock.calls.map(([text, idempotencyKey]) => [text, idempotencyKey])).toEqual([
      ["My stomach hurts", firstKey],
      ["My head hurts", secondKey],
    ]);
  });

  it("suppresses duplicate submissions while the logical request is pending", async () => {
    stubRandomKeys("11111111-1111-4111-8111-111111111111");
    let resolveRequest!: (value: StartPreTriageFromIntakeResponse) => void;
    const execute = vi.fn<ExecuteIntake>(() => new Promise((resolve) => { resolveRequest = resolve; }));
    render(<IntakeHarness execute={execute} />);

    const submit = screen.getByRole("button", { name: "Submit A" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(execute).toHaveBeenCalledOnce();

    resolveRequest({ resolution: "UNRESOLVED" });
    expect(await screen.findByText("unresolved")).toBeInTheDocument();
  });

  it("keeps AMBIGUOUS candidates explicit without selecting or creating a session", async () => {
    stubRandomKeys("11111111-1111-4111-8111-111111111111");
    const execute = vi.fn<ExecuteIntake>().mockResolvedValue({
      resolution: "AMBIGUOUS",
      candidatePathways: ["CHEST_PAIN", "HEADACHE"],
    });
    const onResolved = vi.fn();
    render(<IntakeHarness execute={execute} onResolved={onResolved} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit A" }));

    expect(await screen.findByText("ambiguous")).toBeInTheDocument();
    expect(screen.getByLabelText("candidates")).toHaveTextContent("CHEST_PAIN,HEADACHE");
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("maps 503 to a same-key retry and 409 key reuse to an intentional reset state", async () => {
    const firstKey = "11111111-1111-4111-8111-111111111111";
    const secondKey = "22222222-2222-4222-8222-222222222222";
    stubRandomKeys(firstKey, secondKey);
    const execute = vi.fn<ExecuteIntake>()
      .mockRejectedValueOnce(new BeeexyApiError(503, { problem: { status: 503, errorCode: "pre_triage.interpretation_unavailable" } }))
      .mockRejectedValueOnce(new BeeexyApiError(409, { problem: { status: 409, errorCode: "pre_triage.idempotency_key_reused" } }))
      .mockResolvedValueOnce({ resolution: "UNRESOLVED" });
    render(<IntakeHarness execute={execute} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit A" }));
    expect(await screen.findByText("retryable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("conflict")).toBeInTheDocument();

    expect(execute.mock.calls.map(([, idempotencyKey]) => idempotencyKey)).toEqual([firstKey, firstKey]);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByLabelText("state")).toHaveTextContent("idle");
    fireEvent.click(screen.getByRole("button", { name: "Submit B" }));
    expect(await screen.findByText("unresolved")).toBeInTheDocument();
    expect(execute.mock.calls.map(([, idempotencyKey]) => idempotencyKey)).toEqual([firstKey, firstKey, secondKey]);
  });
});
