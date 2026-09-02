// @vitest-environment jsdom

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { SecondOpinionResultView } from "@/features/second-opinion/second-opinion-result";
import {
  canRegenerateSecondOpinion,
  secondOpinionDisplayState,
  secondOpinionRegenerationError,
} from "@/features/second-opinion/second-opinion-result-state";
import type { SecondOpinion, SecondOpinionAccepted } from "@/lib/beeexy-api/contracts";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const analysisA = "97c61f6e-acf7-4e99-9ea0-cb672904c81e";
const analysisB = "97c61f6e-acf7-4e99-9ea0-cb672904c81f";
const patientId = "9fb45f87-f9dd-4dbf-a2d5-b2be4cd41624";
const executionA = "e12565e6-7201-47e2-adf1-ebaf7891eaae";
const executionB = "e12565e6-7201-47e2-adf1-ebaf7891eaaf";

function successfulOpinion({
  analysisId = analysisA,
  executionId = executionA,
  generatedAt = "2026-09-02T15:30:00+00:00",
  resultVersion = "ai-second-opinion-result@v1",
  summary = "The previous safety-approved educational summary.",
} = {}): SecondOpinion {
  return {
    analysisId,
    patientId,
    executionId,
    status: "succeeded",
    result: {
      summary,
      importantPoints: [`Important point from ${executionId}.`],
      possibleQuestionsForDoctor: [`Question from ${executionId}?`],
      missingInformation: [`Missing item from ${executionId}.`],
      disclaimer: `Authoritative disclaimer from ${executionId}.`,
    },
    metadata: {
      aiGenerated: true,
      generatedAt,
      resultVersion,
      provider: `provider-${executionId}`,
      modelVersion: `model-${executionId}`,
      promptVersion: `prompt-${executionId}`,
      disclaimerVersion: `disclaimer-${executionId}`,
    },
  };
}

function opinion(status: SecondOpinion["status"], fields: Partial<SecondOpinion> = {}): SecondOpinion {
  return { analysisId: analysisA, patientId, status, ...fields };
}

function receipt(status: SecondOpinionAccepted["status"] = "succeeded"): SecondOpinionAccepted {
  return {
    analysisId: analysisA,
    executionId: executionB,
    status,
    statusUrl: `/api/v1/ai/second-opinions/${analysisA}`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

async function renderLoaded(value: SecondOpinion = successfulOpinion()) {
  vi.mocked(beeexyPhase10Api.getSecondOpinion).mockResolvedValueOnce(value);
  render(<SecondOpinionResultView analysisId={value.analysisId} />);
  if (value.status === "succeeded") {
    await screen.findByText(value.result!.summary);
  } else {
    await waitFor(() => expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalled());
  }
}

async function confirmRegeneration() {
  fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
  const dialog = await screen.findByRole("dialog", { name: "Regenerate this Second Opinion?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Regenerate" }));
  return dialog;
}

beforeEach(() => {
  vi.spyOn(beeexyPhase10Api, "getSecondOpinion").mockResolvedValue(successfulOpinion());
  vi.spyOn(beeexyPhase10Api, "regenerateSecondOpinion").mockResolvedValue(receipt());
  vi.spyOn(beeexyPhase10Api, "requestSecondOpinion");
  vi.spyOn(beeexyPhase10Api, "uploadAiDocument");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Phase 10.6 regeneration eligibility and confirmation", () => {
  it.each(["succeeded", "failed", "rejected"] as const)(
    "allows regeneration from terminal %s status",
    (status) => {
      const display = secondOpinionDisplayState(status === "rejected"
        ? opinion(status, { safeMessage: "A safe public message." })
        : status === "succeeded" ? successfulOpinion() : opinion(status));
      expect(canRegenerateSecondOpinion(display)).toBe(true);
    },
  );

  it.each(["pending", "running"] as const)("does not expose Regenerate for %s", async (status) => {
    await renderLoaded(opinion(status));
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
  });

  it("keeps Regenerate distinct from New Second Opinion and confirms immutable-input semantics", async () => {
    await renderLoaded();
    expect(screen.getByRole("link", { name: "New Second Opinion" })).toHaveAttribute("href", "/ai/second-opinion");
    const trigger = screen.getByRole("button", { name: "Regenerate" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Regenerate this Second Opinion?" });
    expect(dialog).toHaveTextContent("same original information");
    expect(dialog).toHaveTextContent("new or changed information");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Regenerate" })).toHaveFocus());
  });
});

describe("Phase 10.6 bodyless mutation and accepted reconciliation", () => {
  it("passes only analysisId and AbortSignal, prevents duplicate POST, and preserves the old result while busy", async () => {
    const pending = deferred<SecondOpinionAccepted>();
    vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mockReturnValue(pending.promise);
    await renderLoaded();

    const dialog = await confirmRegeneration();
    fireEvent.click(within(dialog).getByRole("button", { name: "Regenerating..." }));

    expect(beeexyPhase10Api.regenerateSecondOpinion).toHaveBeenCalledOnce();
    expect(beeexyPhase10Api.regenerateSecondOpinion).toHaveBeenCalledWith(analysisA, expect.any(AbortSignal));
    expect(vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mock.calls[0]).toHaveLength(2);
    expect(screen.getByText("The previous safety-approved educational summary.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Regenerating..." })).toBeDisabled();

    await act(async () => pending.resolve(receipt()));
  });

  it("does one reconciliation GET and updates the existing renderer with backend result and metadata", async () => {
    const regenerated = successfulOpinion({
      executionId: executionB,
      generatedAt: "2026-09-03T18:45:00+00:00",
      resultVersion: "backend-result@v9",
      summary: "The regenerated backend summary.",
    });
    vi.mocked(beeexyPhase10Api.getSecondOpinion)
      .mockResolvedValueOnce(successfulOpinion())
      .mockResolvedValueOnce(regenerated);
    await renderLoaded();
    await confirmRegeneration();

    expect(await screen.findByText("The regenerated backend summary.")).toBeInTheDocument();
    expect(screen.getByText(`Important point from ${executionB}.`)).toBeInTheDocument();
    expect(screen.getByText("backend-result@v9")).toBeInTheDocument();
    expect(screen.getByText(`provider-${executionB}`)).toBeInTheDocument();
    expect(screen.getByText("A new Second Opinion result is ready.")).toBeInTheDocument();
    expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
  });

  it("shows manual status checking for a non-terminal GET and never starts periodic polling", async () => {
    vi.mocked(beeexyPhase10Api.getSecondOpinion)
      .mockResolvedValueOnce(successfulOpinion())
      .mockResolvedValueOnce(opinion("running", { executionId: executionB }));
    await renderLoaded();
    await confirmRegeneration();

    expect(await screen.findByText("Regeneration is still in progress. Check the status when you're ready.")).toBeInTheDocument();
    expect(screen.getByText("The previous safety-approved educational summary.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Check status" })).toHaveLength(1);
    expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledTimes(2);
  });
});

describe("Phase 10.6 preservation and safe failures", () => {
  it("preserves the previous result when reconciliation GET has a transient failure", async () => {
    vi.mocked(beeexyPhase10Api.getSecondOpinion)
      .mockResolvedValueOnce(successfulOpinion())
      .mockRejectedValueOnce(new BeeexyNetworkError());
    await renderLoaded();
    await confirmRegeneration();

    expect(await screen.findByText(/couldn't confirm the latest result/i)).toBeInTheDocument();
    expect(screen.getByText("The previous safety-approved educational summary.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check status" })).toBeEnabled();
  });

  it.each(["failed", "rejected"] as const)(
    "preserves the previous approved snapshot after a terminal %s receipt",
    async (status) => {
      vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mockResolvedValue(receipt(status));
      vi.mocked(beeexyPhase10Api.getSecondOpinion)
        .mockResolvedValueOnce(successfulOpinion())
        .mockResolvedValueOnce(successfulOpinion());
      await renderLoaded();
      await confirmRegeneration();

      expect(await screen.findByText(status === "failed"
        ? /couldn't complete the regeneration/i
        : /declined safely/i)).toBeInTheDocument();
      expect(screen.getByText("The previous safety-approved educational summary.")).toBeInTheDocument();
      expect(beeexyPhase10Api.regenerateSecondOpinion).toHaveBeenCalledOnce();
    },
  );

  it("renders only a safe rejected message when there is no previous approved result", async () => {
    const initial = opinion("failed");
    const rejected = opinion("rejected", {
      executionId: executionB,
      safeMessage: "Beeexy could not safely create this educational result.",
    });
    vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mockResolvedValue(receipt("rejected"));
    vi.mocked(beeexyPhase10Api.getSecondOpinion)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(rejected);
    await renderLoaded(initial);
    await confirmRegeneration();

    expect(await screen.findByText(rejected.safeMessage!)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("provider stack trace");
  });

  it("handles execution conflict without retrying POST and offers a GET-only status check", async () => {
    vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mockRejectedValue(new BeeexyApiError(409, {
      problem: { errorCode: "ai.second_opinion.execution_conflict", detail: "private conflict detail" },
    }));
    await renderLoaded();
    await confirmRegeneration();

    expect(await screen.findByText("A regeneration is already in progress. Check the current status before trying again.")).toBeInTheDocument();
    expect(screen.getByText("The previous safety-approved educational summary.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private conflict detail");
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    await waitFor(() => expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledTimes(2));
    expect(beeexyPhase10Api.regenerateSecondOpinion).toHaveBeenCalledOnce();
  });

  it("treats a POST network failure as ambiguous with no automatic mutation retry", async () => {
    vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mockRejectedValue(new BeeexyNetworkError());
    await renderLoaded();
    await confirmRegeneration();

    expect(await screen.findByText(/confirm whether regeneration started/i)).toBeInTheDocument();
    expect(screen.getByText("The previous safety-approved educational summary.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check status" })).toBeEnabled();
    expect(beeexyPhase10Api.regenerateSecondOpinion).toHaveBeenCalledOnce();
  });

  it("preserves the prior result and offers status reconciliation after a 5xx", async () => {
    vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mockRejectedValue(new BeeexyApiError(503, {
      problem: { detail: "private provider outage detail" },
    }));
    await renderLoaded();
    await confirmRegeneration();

    expect(await screen.findByText("Beeexy couldn’t regenerate this Second Opinion right now.")).toBeInTheDocument();
    expect(screen.getByText("The previous safety-approved educational summary.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check status" })).toBeEnabled();
    expect(document.body).not.toHaveTextContent("private provider outage detail");
    expect(beeexyPhase10Api.regenerateSecondOpinion).toHaveBeenCalledOnce();
  });

  it.each([
    ["ai.second_opinion.immutable_input_invalid", /regenerate this Second Opinion from its original information/i],
    ["ai.second_opinion.regeneration_body_not_allowed", /accept this regeneration request/i],
  ])("maps documented 422 %s safely", async (errorCode, message) => {
    vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mockRejectedValue(new BeeexyApiError(422, {
      problem: { errorCode, detail: "private validation internals" },
    }));
    await renderLoaded();
    await confirmRegeneration();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private validation internals");
    expect(screen.getByText("The previous safety-approved educational summary.")).toBeInTheDocument();
  });
});

describe("Phase 10.6 authorization, immutable boundaries, and route races", () => {
  it.each([
    [401, /Second Opinion .* load/],
    [404, "Second Opinion unavailable"],
  ])("clears sensitive result content after regeneration returns %s", async (status, heading) => {
    vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mockRejectedValue(new BeeexyApiError(status));
    await renderLoaded();
    await confirmRegeneration();

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByText("The previous safety-approved educational summary.")).not.toBeInTheDocument();
  });

  it("is independent of request-form, document, Pre-Triage, Clinical History, and browser persistence state", async () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/second-opinion/second-opinion-result.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/requestSecondOpinion|uploadAiDocument|getPreTriageSession|ClinicalHistory|localStorage|sessionStorage|indexedDB/i);
    expect(source).not.toMatch(/setInterval|setTimeout|provider\.com|FHIR/i);

    vi.mocked(beeexyPhase10Api.getSecondOpinion)
      .mockResolvedValueOnce(successfulOpinion())
      .mockResolvedValueOnce(successfulOpinion({ executionId: executionB }));
    await renderLoaded();
    await confirmRegeneration();

    expect(beeexyPhase10Api.requestSecondOpinion).not.toHaveBeenCalled();
    expect(beeexyPhase10Api.uploadAiDocument).not.toHaveBeenCalled();
  });

  it("aborts an analysis A POST and ignores its completion after navigating to analysis B", async () => {
    const pending = deferred<SecondOpinionAccepted>();
    let mutationSignal: AbortSignal | undefined;
    vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mockImplementation((_id, signal) => {
      mutationSignal = signal;
      return pending.promise;
    });
    vi.mocked(beeexyPhase10Api.getSecondOpinion)
      .mockResolvedValueOnce(successfulOpinion())
      .mockResolvedValueOnce(successfulOpinion({ analysisId: analysisB, summary: "Analysis B result." }));
    const view = render(<SecondOpinionResultView analysisId={analysisA} />);
    await screen.findByText("The previous safety-approved educational summary.");
    await confirmRegeneration();

    view.rerender(<SecondOpinionResultView analysisId={analysisB} />);
    expect(await screen.findByText("Analysis B result.")).toBeInTheDocument();
    expect(mutationSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(receipt()));
    expect(screen.getByText("Analysis B result.")).toBeInTheDocument();
    expect(screen.queryByText("A new Second Opinion result is ready.")).not.toBeInTheDocument();
  });

  it("aborts a regeneration POST when the result view unmounts", async () => {
    const pending = deferred<SecondOpinionAccepted>();
    let mutationSignal: AbortSignal | undefined;
    vi.mocked(beeexyPhase10Api.regenerateSecondOpinion).mockImplementation((_id, signal) => {
      mutationSignal = signal;
      return pending.promise;
    });
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockResolvedValueOnce(successfulOpinion());
    const view = render(<SecondOpinionResultView analysisId={analysisA} />);
    await screen.findByText("The previous safety-approved educational summary.");
    await confirmRegeneration();

    view.unmount();
    expect(mutationSignal?.aborted).toBe(true);
  });

  it("maps generic server failures without exposing raw backend details", () => {
    const mapped = secondOpinionRegenerationError(new BeeexyApiError(500, {
      problem: { detail: "secret provider stack", errorCode: "private.code" },
    }));
    expect(mapped).toMatchObject({ blockRegeneration: true, canCheckStatus: true, kind: "server" });
    expect(mapped.message).not.toContain("secret provider stack");
  });
});
