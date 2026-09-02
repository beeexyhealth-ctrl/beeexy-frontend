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

import SecondOpinionResultPage from "@/app/ai/second-opinions/[analysisId]/page";
import { isPublicRoute } from "@/features/auth/auth-route-boundary";
import { SecondOpinionResultView } from "@/features/second-opinion/second-opinion-result";
import {
  formatSecondOpinionResultDate,
  secondOpinionDisplayState,
} from "@/features/second-opinion/second-opinion-result-state";
import type { SecondOpinion } from "@/lib/beeexy-api/contracts";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const analysisA = "97c61f6e-acf7-4e99-9ea0-cb672904c81e";
const analysisB = "97c61f6e-acf7-4e99-9ea0-cb672904c81f";
const patientId = "9fb45f87-f9dd-4dbf-a2d5-b2be4cd41624";

function successfulOpinion(
  analysisId = analysisA,
  summary = "A safety-approved educational summary.",
): SecondOpinion {
  return {
    analysisId,
    patientId,
    executionId: "e12565e6-7201-47e2-adf1-ebaf7891eaae",
    status: "succeeded",
    result: {
      summary,
      importantPoints: ["A relevant point to discuss with the doctor."],
      possibleQuestionsForDoctor: ["What context would help clarify this?"],
      missingInformation: ["The date the symptoms first appeared."],
      disclaimer: "This exact backend disclaimer is authoritative.",
    },
    metadata: {
      aiGenerated: true,
      generatedAt: "2026-09-02T15:30:00+00:00",
      resultVersion: "ai-second-opinion-result@v1",
      provider: "opaque-backend-provider-id",
      modelVersion: "opaque-backend-model-id",
      promptVersion: "ai-second-opinion@v1",
      disclaimerVersion: "ai-second-opinion-disclaimer-v1",
    },
  };
}

function opinion(status: SecondOpinion["status"], fields: Partial<SecondOpinion> = {}): SecondOpinion {
  return { analysisId: analysisA, patientId, status, ...fields };
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
  vi.mocked(beeexyPhase10Api.getSecondOpinion).mockResolvedValue(value);
  render(<SecondOpinionResultView analysisId={value.analysisId} />);
  await waitFor(() => expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalled());
}

beforeEach(() => {
  vi.spyOn(beeexyPhase10Api, "getSecondOpinion").mockResolvedValue(successfulOpinion());
  vi.spyOn(beeexyPhase10Api, "requestSecondOpinion");
  vi.spyOn(beeexyPhase10Api, "regenerateSecondOpinion");
  vi.spyOn(beeexyPhase10Api, "uploadAiDocument");
  vi.spyOn(beeexyPhase10Api, "getAiConversation");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Phase 10.5 route and authoritative loading", () => {
  it("keeps the canonical route private, awaits its opaque parameter, and passes it to GET", async () => {
    expect(isPublicRoute(`/ai/second-opinions/${analysisA}`)).toBe(false);
    render(await SecondOpinionResultPage({ params: Promise.resolve({ analysisId: analysisA }) }));

    expect(screen.getByRole("heading", { name: "Second Opinion result" })).toBeInTheDocument();
    await waitFor(() => expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledWith(
      analysisA,
      expect.any(AbortSignal),
    ));
  });

  it("shows a result-shaped accessible skeleton without fake medical content", async () => {
    const pending = deferred<SecondOpinion>();
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockReturnValue(pending.promise);
    render(<SecondOpinionResultView analysisId={analysisA} />);

    expect(screen.getByRole("status", { name: "Loading Second Opinion result" })).toBeInTheDocument();
    expect(screen.queryByText(/diagnosis|treatment plan|important point/i)).not.toBeInTheDocument();
    await waitFor(() => expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledOnce());
  });

  it("aborts its GET when the result view unmounts", async () => {
    const pending = deferred<SecondOpinion>();
    let signal: AbortSignal | undefined;
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockImplementation((_id, requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    });
    const view = render(<SecondOpinionResultView analysisId={analysisA} />);
    await waitFor(() => expect(signal).toBeDefined());

    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("aborts and ignores analysis A when navigation changes to analysis B", async () => {
    const pendingA = deferred<SecondOpinion>();
    const pendingB = deferred<SecondOpinion>();
    const signals: AbortSignal[] = [];
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockImplementation((id, signal) => {
      if (signal) signals.push(signal);
      return id === analysisA ? pendingA.promise : pendingB.promise;
    });
    const view = render(<SecondOpinionResultView analysisId={analysisA} />);
    await waitFor(() => expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledWith(
      analysisA,
      expect.any(AbortSignal),
    ));

    view.rerender(<SecondOpinionResultView analysisId={analysisB} />);
    await waitFor(() => expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledWith(
      analysisB,
      expect.any(AbortSignal),
    ));
    expect(signals[0]?.aborted).toBe(true);

    await act(async () => pendingB.resolve(successfulOpinion(analysisB, "Analysis B result")));
    expect(await screen.findByText("Analysis B result")).toBeInTheDocument();
    await act(async () => pendingA.resolve(successfulOpinion(analysisA, "Analysis A result")));
    expect(screen.queryByText("Analysis A result")).not.toBeInTheDocument();
  });
});

describe("Phase 10.5 lifecycle rendering", () => {
  it("renders pending with calm copy, one manual GET action, and no polling or fake result", async () => {
    await renderLoaded(opinion("pending"));

    expect(await screen.findByRole("heading", { name: "Your Second Opinion is pending." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check status" })).toBeInTheDocument();
    expect(screen.queryByText(/doctor is reviewing|diagnosis is being|urgency/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Summary" })).not.toBeInTheDocument();
    expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledOnce();
  });

  it("renders running as preparation without claiming clinical review", async () => {
    await renderLoaded(opinion("running"));

    expect(await screen.findByRole("heading", { name: "Your Second Opinion is being prepared." })).toBeInTheDocument();
    expect(screen.getByText(/preparing your educational result/i)).toBeInTheDocument();
    expect(screen.queryByText(/doctor|physician|diagnosis|urgency/i)).not.toBeInTheDocument();
  });

  it("checks non-terminal status by GET once and prevents duplicate refresh", async () => {
    await renderLoaded(opinion("pending"));
    const refreshed = deferred<SecondOpinion>();
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockReturnValue(refreshed.promise);

    const button = await screen.findByRole("button", { name: "Check status" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Checking status…" })).toBeDisabled();

    await act(async () => refreshed.resolve(successfulOpinion()));
    expect(await screen.findByRole("heading", { name: "Your educational result" })).toBeInTheDocument();
    expect(beeexyPhase10Api.requestSecondOpinion).not.toHaveBeenCalled();
    expect(beeexyPhase10Api.regenerateSecondOpinion).not.toHaveBeenCalled();
  });

  it("renders failed as a generic terminal state without backend internals or automatic retry", async () => {
    await renderLoaded({
      ...opinion("failed"),
      providerError: "NIM timeout and private stack trace",
    } as SecondOpinion);

    expect(await screen.findByRole("heading", { name: /couldn’t complete this Second Opinion/i })).toBeInTheDocument();
    expect(screen.queryByText(/NIM timeout|stack trace/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Second Opinion" })).toHaveAttribute("href", "/ai/second-opinion");
    expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledOnce();
    expect(beeexyPhase10Api.requestSecondOpinion).not.toHaveBeenCalled();
  });

  it("renders only the rejected safeMessage and does not expose raw rejected output", async () => {
    const safeMessage = "Beeexy can’t provide a result for this request.";
    await renderLoaded({
      ...opinion("rejected", { safeMessage }),
      rawOutput: "Hidden diagnosis and rejected provider output",
      rejectionReason: "private classifier reason",
    } as SecondOpinion);

    expect(await screen.findByText(safeMessage)).toBeInTheDocument();
    expect(screen.queryByText(/Hidden diagnosis|private classifier/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Summary" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Second Opinion disclaimer")).not.toBeInTheDocument();
  });

  it("fails closed for an unknown runtime status instead of treating it as success", async () => {
    await renderLoaded({
      ...successfulOpinion(),
      status: "completed",
      result: { ...successfulOpinion().result, summary: "Must remain hidden" },
    } as unknown as SecondOpinion);

    expect(await screen.findByRole("heading", { name: /can’t be displayed safely/i })).toBeInTheDocument();
    expect(screen.queryByText("Must remain hidden")).not.toBeInTheDocument();
  });

  it("fails closed when a succeeded projection omits its required result or metadata", () => {
    expect(secondOpinionDisplayState(opinion("succeeded"))).toEqual({ kind: "unsupported" });
    expect(secondOpinionDisplayState({
      ...successfulOpinion(),
      metadata: undefined,
    })).toEqual({ kind: "unsupported" });
    expect(secondOpinionDisplayState(opinion("rejected"))).toEqual({ kind: "unsupported" });
  });
});

describe("Phase 10.5 successful result projection", () => {
  it("renders the documented fields in contract order with their non-diagnostic headings", async () => {
    await renderLoaded();
    expect(await screen.findByRole("heading", { name: "Your educational result" })).toBeInTheDocument();

    const sections = screen.getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent)
      .filter((text) => [
        "Summary",
        "Important points",
        "Possible questions for your doctor",
        "Missing information",
      ].includes(text ?? ""));
    expect(sections).toEqual([
      "Summary",
      "Important points",
      "Possible questions for your doctor",
      "Missing information",
    ]);
    expect(screen.getByText("A safety-approved educational summary.")).toBeInTheDocument();
    expect(screen.getByText("A relevant point to discuss with the doctor.")).toBeInTheDocument();
    expect(screen.getByText("What context would help clarify this?")).toBeInTheDocument();
    expect(screen.getByText("The date the symptoms first appeared.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /diagnosis|probability|treatment|risk score/i })).not.toBeInTheDocument();
  });

  it("renders the exact backend disclaimer and its public version only for success", async () => {
    await renderLoaded();
    const disclaimer = await screen.findByLabelText("Second Opinion disclaimer");

    expect(within(disclaimer).getByText("This exact backend disclaimer is authoritative.")).toBeInTheDocument();
    expect(disclaimer).toHaveAttribute("data-disclaimer-version", "ai-second-opinion-disclaimer-v1");
  });

  it("renders all documented public metadata without exposing internal IDs", async () => {
    await renderLoaded();
    fireEvent.click(await screen.findByText("Result details"));

    expect(screen.getByText("AI-generated")).toBeInTheDocument();
    expect(screen.getByText("ai-second-opinion-result@v1")).toBeInTheDocument();
    expect(screen.getByText("opaque-backend-provider-id")).toBeInTheDocument();
    expect(screen.getByText("opaque-backend-model-id")).toBeInTheDocument();
    expect(screen.getByText("ai-second-opinion@v1")).toBeInTheDocument();
    expect(screen.getByText("ai-second-opinion-disclaimer-v1")).toBeInTheDocument();
    expect(screen.queryByText(analysisA)).not.toBeInTheDocument();
    expect(screen.queryByText("e12565e6-7201-47e2-adf1-ebaf7891eaae")).not.toBeInTheDocument();
  });

  it("does not fabricate optional provider, model, or prompt metadata", async () => {
    const response = successfulOpinion();
    if (!response.metadata) throw new Error("Fixture metadata is required.");
    response.metadata = {
      aiGenerated: response.metadata.aiGenerated,
      generatedAt: response.metadata.generatedAt,
      resultVersion: response.metadata.resultVersion,
      disclaimerVersion: response.metadata.disclaimerVersion,
    };
    await renderLoaded(response);
    fireEvent.click(await screen.findByText("Result details"));

    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Model version")).not.toBeInTheDocument();
    expect(screen.queryByText("Prompt version")).not.toBeInTheDocument();
  });

  it("represents valid empty arrays without inventing clinical entries", async () => {
    const response = successfulOpinion();
    if (!response.result) throw new Error("Fixture result is required.");
    response.result = {
      ...response.result,
      importantPoints: [],
      possibleQuestionsForDoctor: [],
      missingInformation: [],
    };
    await renderLoaded(response);

    expect(await screen.findAllByText("No entries were included in this section.")).toHaveLength(3);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("renders returned strings as text rather than trusted HTML or Markdown", async () => {
    const unsafe = "<img src=x onerror=alert(1)> **not Markdown**";
    const response = successfulOpinion(analysisA, unsafe);
    if (!response.result) throw new Error("Fixture result is required.");
    response.result.importantPoints = ["<script>private()</script>"];
    await renderLoaded(response);

    expect(await screen.findByText(unsafe)).toBeInTheDocument();
    expect(screen.getByText("<script>private()</script>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });

  it("formats an ISO instant with locale conventions and handles invalid values safely", () => {
    expect(formatSecondOpinionResultDate("2026-09-02T15:30:00+00:00")).not.toBe("Date unavailable");
    expect(formatSecondOpinionResultDate("not-a-date")).toBe("Date unavailable");
  });
});

describe("Phase 10.5 retrieval failures and reconciliation", () => {
  it("maps 401 safely and does not render result data", async () => {
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockRejectedValue(new BeeexyApiError(401, {
      problem: { detail: "Raw token failure", status: 401 },
    }));
    render(<SecondOpinionResultView analysisId={analysisA} />);

    expect(await screen.findByText(/session has ended/i)).toBeInTheDocument();
    expect(screen.queryByText("Raw token failure")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Summary" })).not.toBeInTheDocument();
  });

  it("uses one neutral concealed-404 state without ownership leakage", async () => {
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockRejectedValue(new BeeexyApiError(404, {
      problem: { detail: "Belongs to another patient", errorCode: "ai.second_opinion.not_found" },
    }));
    render(<SecondOpinionResultView analysisId={analysisA} />);

    expect(await screen.findByRole("heading", { name: "Second Opinion unavailable" })).toBeInTheDocument();
    expect(screen.getByText("This Second Opinion is unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/another patient|not found|unauthorized/i)).not.toBeInTheDocument();
  });

  it("recovers deliberately from an initial network error without mutation retry", async () => {
    vi.mocked(beeexyPhase10Api.getSecondOpinion)
      .mockRejectedValueOnce(new BeeexyNetworkError())
      .mockResolvedValueOnce(successfulOpinion());
    render(<SecondOpinionResultView analysisId={analysisA} />);

    expect(await screen.findByText(/couldn’t reach Beeexy/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Your educational result" })).toBeInTheDocument();
    expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledTimes(2);
    expect(beeexyPhase10Api.requestSecondOpinion).not.toHaveBeenCalled();
  });

  it("maps server failures to generic copy without raw ProblemDetails", async () => {
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockRejectedValue(new BeeexyApiError(500, {
      problem: { detail: "Provider secret and stack trace", status: 500 },
    }));
    render(<SecondOpinionResultView analysisId={analysisA} />);

    expect(await screen.findByText("We couldn’t load this Second Opinion right now.")).toBeInTheDocument();
    expect(screen.queryByText(/Provider secret|stack trace/i)).not.toBeInTheDocument();
  });

  it("preserves a successful projection when manual refresh has a transient failure", async () => {
    await renderLoaded();
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockRejectedValue(new BeeexyNetworkError());

    fireEvent.click(await screen.findByRole("button", { name: "Refresh Second Opinion result" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your current result remains available.");
    expect(screen.getByText("A safety-approved educational summary.")).toBeInTheDocument();
    expect(screen.getByText("This exact backend disclaimer is authoritative.")).toBeInTheDocument();
  });

  it("clears a prior result when refresh returns concealed 404", async () => {
    await renderLoaded();
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockRejectedValue(new BeeexyApiError(404));

    fireEvent.click(await screen.findByRole("button", { name: "Refresh Second Opinion result" }));
    expect(await screen.findByRole("heading", { name: "Second Opinion unavailable" })).toBeInTheDocument();
    expect(screen.queryByText("A safety-approved educational summary.")).not.toBeInTheDocument();
  });

  it("moves focus to the updated result region after a deliberate status check", async () => {
    await renderLoaded(opinion("pending"));
    vi.mocked(beeexyPhase10Api.getSecondOpinion).mockResolvedValue(successfulOpinion());
    fireEvent.click(await screen.findByRole("button", { name: "Check status" }));

    await screen.findByRole("heading", { name: "Your educational result" });
    await waitFor(() => expect(document.activeElement).toHaveClass("second-opinion-result-content"));
  });
});

describe("Phase 10.5 privacy and scope boundaries", () => {
  it("uses only the result GET and remains independent of form, document, history, and conversation state", async () => {
    await renderLoaded();

    expect(beeexyPhase10Api.getSecondOpinion).toHaveBeenCalledOnce();
    expect(beeexyPhase10Api.requestSecondOpinion).not.toHaveBeenCalled();
    expect(beeexyPhase10Api.uploadAiDocument).not.toHaveBeenCalled();
    expect(beeexyPhase10Api.getAiConversation).not.toHaveBeenCalled();
  });

  it("contains no polling, browser persistence, provider call, or Clinical History promotion", async () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/second-opinion/second-opinion-result.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/setInterval|localStorage|sessionStorage|indexedDB/i);
    expect(source).not.toMatch(/uploadAiDocument|usePreTriage|useClinicalHistory/i);
    expect(source).not.toMatch(/provider\.com|Save to Clinical History|FHIR/i);

    await renderLoaded();
    expect(screen.queryByRole("link", { name: /save to clinical history|FHIR/i })).not.toBeInTheDocument();
    expect(beeexyPhase10Api.regenerateSecondOpinion).not.toHaveBeenCalled();
  });
});
