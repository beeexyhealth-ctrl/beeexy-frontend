// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiDocument, ClinicalHistoryItem } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";
import { SecondOpinionRequestFlow } from "@/features/second-opinion/second-opinion-request-flow";
import {
  SECOND_OPINION_HISTORY_MAX_SELECTIONS,
  SECOND_OPINION_TEXT_MAX_LENGTH,
  buildSecondOpinionRequest,
  isUsableAiDocument,
  secondOpinionSubmissionError,
} from "@/features/second-opinion/second-opinion-request-state";
import { beeexyPhase10Api } from "@/lib/beeexy-api/phase-10-api";
import SecondOpinionRequestPage from "@/app/ai/second-opinion/page";
import { HomeDashboard } from "@/features/home/home-dashboard";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refreshPatients: vi.fn(async () => []),
  patientContext: {
    activePatient: null as null | {
      profileId: string;
      beeexyId: string;
      firstName: string;
      lastName: string;
      accessType: "Primary" | "Managed";
      relationship: null | { relationshipId: string; type: "Child" };
    },
    bootstrapStatus: "ready" as const,
    patients: [] as Array<{
      profileId: string;
      beeexyId: string;
      firstName: string;
      lastName: string;
      accessType: "Primary" | "Managed";
      relationship: null | { relationshipId: string; type: "Child" };
    }>,
    refreshPatients: vi.fn(async () => []),
    selectActivePatient: vi.fn(),
  },
  preTriageContext: {
    active: null as null | {
      sessionId: string;
      mode: "authenticated";
      pathway: "HEADACHE";
      patientId: string;
      questionnaireVersion: string;
      expiresAt: string;
      acceptedAnswers: Record<string, never>;
      result: {
        sessionId: string;
        episodeId: string;
        primarySymptom: { code: "HEADACHE"; display: "Headache" };
        duration: { value: number; unit: "DAYS" };
        intensity: number;
        additionalSymptoms: [];
        completedAt: string;
        questionnaire: { code: string; version: string };
        package: { code: string; version: string };
        clinicalContent: {
          source: "PRODUCT_DEMO_DEFINED";
          reviewStatus: "NOT_APPLICABLE";
          clinicalApproval: "NOT_CLINICALLY_APPROVED";
        };
      };
      pendingClaim: false;
    },
    hydrated: true,
  },
  historyByPatient: {} as Record<string, ClinicalHistoryItem[]>,
  historyError: null as unknown,
  historyLoading: false,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/ai/second-opinion",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/features/my-circle/patient-provider", () => ({
  usePatients: () => mocks.patientContext,
}));

vi.mock("@/features/pre-triage/pre-triage-provider", () => ({
  usePreTriage: () => mocks.preTriageContext,
}));

vi.mock("@/features/clinical-history/use-clinical-history", () => ({
  useClinicalHistory: (patientId: string) => ({
    error: mocks.historyError,
    isLoading: mocks.historyLoading,
    isLoadingMore: false,
    items: mocks.historyByPatient[patientId] ?? [],
    loadMore: vi.fn(),
    nextCursor: null,
    refresh: vi.fn(async () => undefined),
  }),
}));

const patientA = {
  profileId: "11111111-1111-4111-8111-111111111111",
  beeexyId: "BXY-A",
  firstName: "Alex",
  lastName: "Morgan",
  accessType: "Primary" as const,
  relationship: null,
};

const patientB = {
  profileId: "22222222-2222-4222-8222-222222222222",
  beeexyId: "BXY-B",
  firstName: "Bailey",
  lastName: "Rivera",
  accessType: "Managed" as const,
  relationship: { relationshipId: "relationship-b", type: "Child" as const },
};

const historyA: ClinicalHistoryItem[] = [
  {
    eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    eventType: "COMPLETED_PRE_TRIAGE",
    occurredAt: "2026-09-01T10:00:00",
    recordedAt: "2026-09-01T10:01:00",
    source: {
      type: "PRE_TRIAGE_EPISODE",
      id: "episode-a1",
      questionnaireVersionId: "questionnaire-a1",
      clinicalRuleSetVersionId: "rules-a1",
    },
  },
  {
    eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    eventType: "COMPLETED_PRE_TRIAGE",
    occurredAt: "2026-08-30T09:00:00",
    recordedAt: "2026-08-30T09:01:00",
    source: {
      type: "PRE_TRIAGE_EPISODE",
      id: "episode-a2",
      questionnaireVersionId: "questionnaire-a2",
      clinicalRuleSetVersionId: "rules-a2",
    },
  },
  {
    eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    eventType: "COMPLETED_PRE_TRIAGE",
    occurredAt: "2026-08-25T08:00:00",
    recordedAt: "2026-08-25T08:01:00",
    source: {
      type: "PRE_TRIAGE_EPISODE",
      id: "episode-a3",
      questionnaireVersionId: "questionnaire-a3",
      clinicalRuleSetVersionId: "rules-a3",
    },
  },
  {
    eventId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    eventType: "COMPLETED_PRE_TRIAGE",
    occurredAt: "2026-08-20T07:00:00",
    recordedAt: "2026-08-20T07:01:00",
    source: {
      type: "PRE_TRIAGE_EPISODE",
      id: "episode-a4",
      questionnaireVersionId: "questionnaire-a4",
      clinicalRuleSetVersionId: "rules-a4",
    },
  },
];

const uploadedDocument: AiDocument = {
  documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  contentType: "text/plain",
  sizeBytes: 1_024,
  uploadedAt: "2026-09-02T09:00:00Z",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  status: "active",
};

function completedPreTriage(patientId = patientA.profileId) {
  return {
    sessionId: "33333333-3333-4333-8333-333333333333",
    mode: "authenticated" as const,
    pathway: "HEADACHE" as const,
    patientId,
    questionnaireVersion: "v1",
    expiresAt: "2099-09-03T09:00:00Z",
    acceptedAnswers: {},
    result: {
      sessionId: "33333333-3333-4333-8333-333333333333",
      episodeId: "episode-current",
      primarySymptom: { code: "HEADACHE" as const, display: "Headache" as const },
      duration: { value: 2, unit: "DAYS" as const },
      intensity: 4,
      additionalSymptoms: [] as [],
      completedAt: "2026-09-02T08:00:00",
      questionnaire: { code: "HEADACHE", version: "v1" },
      package: { code: "HEADACHE", version: "v1" },
      clinicalContent: {
        source: "PRODUCT_DEMO_DEFINED" as const,
        reviewStatus: "NOT_APPLICABLE" as const,
        clinicalApproval: "NOT_CLINICALLY_APPROVED" as const,
      },
    },
    pendingClaim: false as const,
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

function goToContext(text = "Please review these ongoing symptoms.") {
  const textarea = screen.getByLabelText(/Describe the case/i);
  if (text) fireEvent.change(textarea, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /Continue to additional information/i }));
}

function goToReview() {
  fireEvent.click(screen.getByRole("button", { name: /Review request/i }));
}

async function uploadDocument(filename = "notes.txt") {
  vi.mocked(beeexyPhase10Api.uploadAiDocument).mockResolvedValue(uploadedDocument);
  const file = new File(["Useful notes"], filename, { type: "text/plain" });
  fireEvent.change(screen.getByLabelText(/Select a document/i), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload document" }));
  await screen.findByText("Document uploaded and available temporarily.");
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.patientContext.activePatient = patientA;
  mocks.patientContext.patients = [patientA, patientB];
  mocks.patientContext.refreshPatients.mockReset();
  mocks.patientContext.refreshPatients.mockResolvedValue([]);
  mocks.preTriageContext.active = completedPreTriage();
  mocks.preTriageContext.hydrated = true;
  mocks.historyByPatient = { [patientA.profileId]: historyA, [patientB.profileId]: [] };
  mocks.historyError = null;
  mocks.historyLoading = false;
  vi.spyOn(beeexyPhase10Api, "uploadAiDocument");
  vi.spyOn(beeexyPhase10Api, "deleteAiDocument");
  vi.spyOn(beeexyPhase10Api, "requestSecondOpinion");
  vi.spyOn(beeexyPhase10Api, "getSecondOpinion");
});

afterEach(() => cleanup());

describe("Phase 10.4 route and staged request", () => {
  it("renders the canonical route with active-patient initialization and no result UI", () => {
    render(<SecondOpinionRequestPage />);
    expect(screen.getByRole("heading", { name: "Request a Second Opinion" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Patient/i })).toHaveValue(patientA.profileId);
    expect(screen.getByText("Patient + case")).toBeInTheDocument();
    expect(screen.queryByText(/Summary|Important points|Questions for your doctor/i)).not.toBeInTheDocument();
  });

  it("provides a canonical home entry and removes the demo provider-consensus claim", () => {
    render(<HomeDashboard configured email="alex@example.test" name="Alex" signedIn />);
    expect(screen.getByRole("link", { name: /AI Second Opinion/i })).toHaveAttribute("href", "/ai/second-opinion");
    expect(screen.queryByText(/3 independent|GPT|Gemini|Claude/i)).not.toBeInTheDocument();
  });

  it("shows only authorized patient options with no arbitrary ID input", () => {
    render(<SecondOpinionRequestFlow />);
    const patient = screen.getByRole("combobox", { name: /Patient/i });
    expect(within(patient).getAllByRole("option")).toHaveLength(3);
    expect(within(patient).getByRole("option", { name: /Alex Morgan/i })).toHaveValue(patientA.profileId);
    expect(within(patient).getByRole("option", { name: /Bailey Rivera/i })).toHaveValue(patientB.profileId);
    expect(screen.queryByPlaceholderText(/UUID|patient ID/i)).not.toBeInTheDocument();
  });

  it("allows a context-only request but prevents review with whitespace and no source", () => {
    render(<SecondOpinionRequestFlow />);
    goToContext("   ");
    expect(screen.getByRole("button", { name: /Review request/i })).toBeDisabled();
    expect(beeexyPhase10Api.requestSecondOpinion).not.toHaveBeenCalled();
  });

  it("applies the documented 8,000-character limit and preserves text across steps", () => {
    render(<SecondOpinionRequestFlow />);
    const textarea = screen.getByLabelText(/Describe the case/i);
    expect(textarea).toHaveAttribute("maxlength", String(SECOND_OPINION_TEXT_MAX_LENGTH));
    fireEvent.change(textarea, { target: { value: "Keep this case description" } });
    goToContext("");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText(/Describe the case/i)).toHaveValue("Keep this case description");
  });
});

describe("Phase 10.4 patient-scoped context", () => {
  it("offers only the completed authenticated Pre-Triage for the selected patient", () => {
    render(<SecondOpinionRequestFlow />);
    goToContext();
    expect(screen.getByRole("checkbox", { name: /Headache Pre-Triage/i })).toBeInTheDocument();
    expect(screen.queryByText(/questionnaire|rule set|clinical approval/i)).not.toBeInTheDocument();
  });

  it("shows a neutral Pre-Triage empty state when no eligible current session exists", () => {
    mocks.preTriageContext.active = null;
    render(<SecondOpinionRequestFlow />);
    goToContext();
    expect(screen.getByText(/No completed Pre-Triage information is available/i)).toBeInTheDocument();
  });

  it("preserves Clinical History order and caps selection at three exact events", () => {
    render(<SecondOpinionRequestFlow />);
    goToContext();
    const records = screen.getAllByRole("checkbox", { name: /Completed Pre-Triage record/i });
    expect(records).toHaveLength(4);
    expect(records[0].parentElement).toHaveTextContent("Sep 1, 2026");
    expect(records[1].parentElement).toHaveTextContent("Aug 30, 2026");
    records.slice(0, 3).forEach((record) => fireEvent.click(record));
    expect(records[3]).toBeDisabled();
    expect(screen.getByText(`3 of ${SECOND_OPINION_HISTORY_MAX_SELECTIONS} selected`)).toBeInTheDocument();
  });

  it("shows a neutral Clinical History empty state for another patient", () => {
    render(<SecondOpinionRequestFlow />);
    fireEvent.change(screen.getByRole("combobox", { name: /Patient/i }), { target: { value: patientB.profileId } });
    goToContext();
    expect(screen.getByText("No Clinical History information is available for this patient.")).toBeInTheDocument();
  });

  it("clears patient-scoped selections on switch while preserving case text and document state", async () => {
    render(<SecondOpinionRequestFlow />);
    goToContext("Preserve this case");
    await uploadDocument("patient-neutral.txt");
    fireEvent.click(screen.getByRole("checkbox", { name: /Headache Pre-Triage/i }));
    fireEvent.click(screen.getAllByRole("checkbox", { name: /Completed Pre-Triage record/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.change(screen.getByRole("combobox", { name: /Patient/i }), { target: { value: patientB.profileId } });
    expect(screen.getByLabelText(/Describe the case/i)).toHaveValue("Preserve this case");
    goToContext("");
    expect(screen.getByText("patient-neutral.txt")).toBeInTheDocument();
    expect(screen.getByText(/No completed Pre-Triage information is available/i)).toBeInTheDocument();
    expect(screen.getByText("No Clinical History information is available for this patient.")).toBeInTheDocument();
  });
});

describe("Phase 10.4 document, review, and exact submission", () => {
  it("reuses the uploader and submits its document ID rather than a local File", async () => {
    vi.mocked(beeexyPhase10Api.requestSecondOpinion).mockResolvedValue({
      analysisId: "analysis-document",
      executionId: "execution-document",
      status: "succeeded",
      statusUrl: "/api/v1/ai/second-opinions/analysis-document",
    });
    render(<SecondOpinionRequestFlow />);
    goToContext("");
    await uploadDocument("report.txt");
    goToReview();
    expect(screen.getByText("report.txt")).toBeInTheDocument();
    expect(screen.queryByText("Useful notes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request Second Opinion" }));

    await waitFor(() => expect(beeexyPhase10Api.requestSecondOpinion).toHaveBeenCalledWith(
      { patientId: patientA.profileId, documentIds: [uploadedDocument.documentId] },
      expect.any(AbortSignal),
    ));
    const request = vi.mocked(beeexyPhase10Api.requestSecondOpinion).mock.calls[0][0];
    expect(Object.values(request).some((value) => value instanceof File)).toBe(false);
  });

  it("reviews safe labels, preserves draft on Back, and sends the exact complete DTO", async () => {
    vi.mocked(beeexyPhase10Api.requestSecondOpinion).mockResolvedValue({
      analysisId: "backend-analysis-id",
      executionId: "backend-execution-id",
      status: "rejected",
      statusUrl: "/api/v1/ai/second-opinions/backend-analysis-id",
    });
    render(<SecondOpinionRequestFlow />);
    goToContext("  Persistent concern to review.  ");
    await uploadDocument("case-notes.txt");
    fireEvent.click(screen.getByRole("checkbox", { name: /Headache Pre-Triage/i }));
    fireEvent.click(screen.getAllByRole("checkbox", { name: /Completed Pre-Triage record/i })[0]);
    goToReview();

    expect(screen.getByText("Alex Morgan")).toBeInTheDocument();
    expect(screen.getByText("Persistent concern to review.")).toBeInTheDocument();
    expect(screen.getByText("case-notes.txt")).toBeInTheDocument();
    expect(screen.queryByText(uploadedDocument.documentId)).not.toBeInTheDocument();
    expect(screen.queryByText(historyA[0].eventId)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("checkbox", { name: /Headache Pre-Triage/i })).toBeChecked();
    goToReview();
    fireEvent.click(screen.getByRole("button", { name: "Request Second Opinion" }));

    await waitFor(() => expect(beeexyPhase10Api.requestSecondOpinion).toHaveBeenCalledWith({
      patientId: patientA.profileId,
      text: "Persistent concern to review.",
      documentIds: [uploadedDocument.documentId],
      preTriageSessionId: completedPreTriage().sessionId,
      clinicalHistoryEventIds: [historyA[0].eventId],
    }, expect.any(AbortSignal)));
    expect(mocks.push).toHaveBeenCalledWith("/ai/second-opinions/backend-analysis-id");
    expect(beeexyPhase10Api.getSecondOpinion).not.toHaveBeenCalled();
  });

  it("prevents duplicate submission while the terminal 202 request is pending", async () => {
    const pending = deferred<{
      analysisId: string;
      executionId: string;
      status: "succeeded";
      statusUrl: string;
    }>();
    vi.mocked(beeexyPhase10Api.requestSecondOpinion).mockReturnValue(pending.promise);
    render(<SecondOpinionRequestFlow />);
    goToContext("One mutation only");
    goToReview();
    const submit = screen.getByRole("button", { name: "Request Second Opinion" });
    fireEvent.click(submit);
    fireEvent.submit(screen.getByRole("form", { name: "Review Second Opinion request" }));
    expect(beeexyPhase10Api.requestSecondOpinion).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Requesting…" })).toBeDisabled();

    await act(async () => pending.resolve({
      analysisId: "backend-only-id",
      executionId: "execution-only-id",
      status: "succeeded",
      statusUrl: "/api/v1/ai/second-opinions/backend-only-id",
    }));
    expect(mocks.push).toHaveBeenCalledWith("/ai/second-opinions/backend-only-id");
    expect(beeexyPhase10Api.requestSecondOpinion).toHaveBeenCalledOnce();
  });

  it("drops an expired document from the request instead of submitting it", () => {
    const expired = { ...uploadedDocument, expiresAt: "2020-01-01T00:00:00Z" };
    expect(isUsableAiDocument(expired)).toBe(false);
    expect(buildSecondOpinionRequest({
      patientId: patientA.profileId,
      text: "Text remains",
      document: expired,
      preTriage: null,
      clinicalHistory: [],
    })).toEqual({ patientId: patientA.profileId, text: "Text remains" });
  });
});

describe("Phase 10.4 recoverable submission errors", () => {
  it.each([
    [new BeeexyApiError(401), "session has ended", "review"],
    [new BeeexyApiError(409), "not ready to use", "context"],
    [new BeeexyApiError(422, { problem: { errorCode: "ai.second_opinion.text_invalid" } }), "case description", "case"],
    [new BeeexyApiError(422, { problem: { errorCode: "ai.second_opinion.document_unavailable" } }), "temporary document", "context"],
    [new BeeexyNetworkError(), "couldn’t confirm whether", "review"],
    [new BeeexyApiError(500), "couldn’t confirm whether", "review"],
  ])("maps %# to safe product copy and the affected step", (error, copy, destination) => {
    const mapped = secondOpinionSubmissionError(error);
    expect(mapped.message).toContain(copy);
    expect(mapped.destination).toBe(destination);
    expect(mapped.message).not.toContain("provider");
  });

  it("preserves text after a 401 and allows a deliberate retry without automatic resubmission", async () => {
    vi.mocked(beeexyPhase10Api.requestSecondOpinion).mockRejectedValueOnce(new BeeexyApiError(401));
    render(<SecondOpinionRequestFlow />);
    goToContext("Preserve after auth error");
    goToReview();
    fireEvent.click(screen.getByRole("button", { name: "Request Second Opinion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("session has ended");
    expect(beeexyPhase10Api.requestSecondOpinion).toHaveBeenCalledOnce();
    expect(screen.getByText("Preserve after auth error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request Second Opinion" })).toBeEnabled();
  });

  it("handles concealed 404 neutrally, clears references, refreshes patients, and keeps case text", async () => {
    vi.mocked(beeexyPhase10Api.requestSecondOpinion).mockRejectedValue(new BeeexyApiError(404, {
      problem: { detail: "foreign account resource" },
    }));
    render(<SecondOpinionRequestFlow />);
    goToContext("Keep this private case");
    fireEvent.click(screen.getByRole("checkbox", { name: /Headache Pre-Triage/i }));
    fireEvent.click(screen.getAllByRole("checkbox", { name: /Completed Pre-Triage record/i })[0]);
    goToReview();
    fireEvent.click(screen.getByRole("button", { name: "Request Second Opinion" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Some selected information is no longer available");
    expect(screen.queryByText("foreign account resource")).not.toBeInTheDocument();
    expect(mocks.patientContext.refreshPatients).toHaveBeenCalledOnce();
    expect(screen.getByLabelText(/Describe the case/i)).toHaveValue("Keep this private case");
    goToContext("");
    expect(screen.getByRole("checkbox", { name: /Headache Pre-Triage/i })).not.toBeChecked();
  });

  it("keeps all valid inputs after an ambiguous network failure and never retries automatically", async () => {
    vi.mocked(beeexyPhase10Api.requestSecondOpinion).mockRejectedValue(new BeeexyNetworkError());
    render(<SecondOpinionRequestFlow />);
    goToContext("Ambiguous request draft");
    fireEvent.click(screen.getByRole("checkbox", { name: /Headache Pre-Triage/i }));
    goToReview();
    fireEvent.click(screen.getByRole("button", { name: "Request Second Opinion" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("won’t retry automatically");
    expect(screen.getByText("Ambiguous request draft")).toBeInTheDocument();
    expect(screen.getByText("Headache Pre-Triage")).toBeInTheDocument();
    expect(beeexyPhase10Api.requestSecondOpinion).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
