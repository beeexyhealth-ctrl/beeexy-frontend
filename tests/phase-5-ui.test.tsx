// @vitest-environment jsdom

import type { AnchorHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const patientMocks = vi.hoisted(() => ({
  activePatient: { profileId: "patient-a", beeexyId: "BXY-A", firstName: "Alex", lastName: "Rivera", accessType: "Primary", relationship: null },
  refreshPatients: vi.fn(async () => []),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/features/my-circle/patient-provider", () => ({
  usePatients: () => ({ activePatient: patientMocks.activePatient, refreshPatients: patientMocks.refreshPatients }),
}));

import { ClinicalHistoryEventView } from "@/features/clinical-history/clinical-history-event-view";
import { ClinicalHistoryView } from "@/features/clinical-history/clinical-history-view";
import type { ClinicalHistoryAmendment, ClinicalHistoryEventDetail, ClinicalHistoryItem } from "@/lib/beeexy-api/contracts";
import { beeexyPhase5Api } from "@/lib/beeexy-api/phase-5-api";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";

const episodeId = "50000000-0000-0000-0000-000000000005";
const source = {
  type: "PRE_TRIAGE_EPISODE" as const,
  id: episodeId,
  questionnaireVersionId: "30000000-0000-0000-0000-000000000003",
  clinicalRuleSetVersionId: "40000000-0000-0000-0000-000000000004",
};
const provenance = {
  sourceType: source.type,
  sourceId: source.id,
  questionnaireVersionId: source.questionnaireVersionId,
  clinicalRuleSetVersionId: source.clinicalRuleSetVersionId,
};

function historyItem(eventId: string, occurredAt = "2026-08-24T14:30:00Z"): ClinicalHistoryItem {
  return { eventId, eventType: "COMPLETED_PRE_TRIAGE", occurredAt, recordedAt: occurredAt, source: { ...source, id: `episode-${eventId}` } };
}

function amendment(amendmentId: string, reason: string, createdAt: string): ClinicalHistoryAmendment {
  return { amendmentId, reason, author: { type: "BEEEXY_ACCOUNT", beeexyId: "BXY-A" }, createdAt, provenance };
}

type PreTriageSummaryOverrides = Pick<
  ClinicalHistoryEventDetail,
  "additionalSymptoms" | "duration" | "intensity" | "primarySymptom"
>;

function detail(
  amendments: ClinicalHistoryAmendment[] = [],
  summary: Partial<PreTriageSummaryOverrides> = {},
): ClinicalHistoryEventDetail {
  return {
    ...historyItem("event-detail"),
    source,
    provenance,
    amendments,
    primarySymptom: null,
    duration: null,
    intensity: null,
    additionalSymptoms: null,
    ...summary,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, reject, resolve };
}

beforeEach(() => {
  patientMocks.activePatient = { profileId: "patient-a", beeexyId: "BXY-A", firstName: "Alex", lastName: "Rivera", accessType: "Primary", relationship: null };
  patientMocks.refreshPatients.mockClear();
  vi.spyOn(beeexyPhase5Api, "getClinicalHistory").mockReset();
  vi.spyOn(beeexyPhase5Api, "getClinicalHistoryEvent").mockReset();
  vi.spyOn(beeexyPhase5Api, "createPreTriageAmendment").mockReset();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Clinical History list", () => {
  it("renders loading and empty states without synthetic records", async () => {
    vi.mocked(beeexyPhase5Api.getClinicalHistory).mockResolvedValue({ items: [], nextCursor: null });
    render(<ClinicalHistoryView />);
    expect(screen.getByLabelText("Loading Clinical History")).toBeInTheDocument();
    expect(await screen.findByText("No Clinical History yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view pre-triage/i })).not.toBeInTheDocument();
  });

  it("loads more than ten records, sends the opaque cursor, and appends unique events", async () => {
    const first = Array.from({ length: 11 }, (_, index) => historyItem(`event-${index}`));
    vi.mocked(beeexyPhase5Api.getClinicalHistory)
      .mockResolvedValueOnce({ items: first, nextCursor: "opaque-cursor" })
      .mockResolvedValueOnce({ items: [historyItem("event-10"), historyItem("event-11")], nextCursor: null });

    render(<ClinicalHistoryView />);
    await waitFor(() => expect(screen.getAllByRole("link", { name: /view pre-triage/i })).toHaveLength(11));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("link", { name: /view pre-triage/i })).toHaveLength(12));

    expect(beeexyPhase5Api.getClinicalHistory).toHaveBeenNthCalledWith(2, "patient-a", {
      cursor: "opaque-cursor",
      eventType: "COMPLETED_PRE_TRIAGE",
      pageSize: 20,
    }, expect.any(AbortSignal));
  });

  it("clears old items and ignores stale responses when the active patient changes", async () => {
    const patientA = deferred<{ items: ClinicalHistoryItem[]; nextCursor: null }>();
    vi.mocked(beeexyPhase5Api.getClinicalHistory).mockImplementation(async (patientId) => {
      if (patientId === "patient-a") return patientA.promise;
      return { items: [historyItem("event-b", "2026-08-23T14:30:00Z")], nextCursor: null };
    });
    const view = render(<ClinicalHistoryView />);

    await waitFor(() => expect(beeexyPhase5Api.getClinicalHistory).toHaveBeenCalledWith("patient-a", expect.anything(), expect.any(AbortSignal)));
    patientMocks.activePatient = { ...patientMocks.activePatient, profileId: "patient-b", beeexyId: "BXY-B", firstName: "Bailey" };
    view.rerender(<ClinicalHistoryView />);
    expect(await screen.findByText("August 23, 2026")).toBeInTheDocument();

    patientA.resolve({ items: [historyItem("event-a", "2026-08-24T14:30:00Z")], nextCursor: null });
    await Promise.resolve();
    expect(screen.queryByText("August 24, 2026")).not.toBeInTheDocument();
    expect(screen.getByText("Health activity for Bailey Rivera")).toBeInTheDocument();
  });
});

describe("Clinical History detail and amendments", () => {
  it("renders the full patient-facing Pre-Triage summary before technical metadata", async () => {
    vi.mocked(beeexyPhase5Api.getClinicalHistoryEvent).mockResolvedValue(detail([
      amendment("amendment-1", "Corrected note", "2026-08-24T15:00:00Z"),
    ], {
      primarySymptom: { code: "HEADACHE", display: "Headache" },
      duration: { value: 2, unit: "DAYS" },
      intensity: 7,
      additionalSymptoms: ["FEVER", "NAUSEA"],
    }));
    render(<ClinicalHistoryEventView eventId="event-detail" />);

    const summary = await screen.findByRole("heading", { name: "Pre-Triage Summary" });
    const metadata = screen.getByRole("heading", { name: "Original event metadata" });
    expect(summary.compareDocumentPosition(metadata) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Headache")).toBeInTheDocument();
    expect(screen.getByText("2 days")).toBeInTheDocument();
    expect(screen.getByText("7")).toHaveTextContent("7 / 10");
    expect(screen.getByText("Fever")).toBeInTheDocument();
    expect(screen.getByText("Nausea")).toBeInTheDocument();
    expect(screen.getByText("Technical traceability")).toBeInTheDocument();
    expect(screen.getByText("Corrected note")).toBeInTheDocument();
    expect(screen.queryByText(/urgency|diagnosis|recommendation|treatment|red flag/i)).not.toBeInTheDocument();
  });

  it("hides missing summary rows and formats a singular duration", async () => {
    vi.mocked(beeexyPhase5Api.getClinicalHistoryEvent).mockResolvedValue(detail([], {
      primarySymptom: null,
      duration: { value: 1, unit: "HOURS" },
      intensity: null,
      additionalSymptoms: null,
    }));
    render(<ClinicalHistoryEventView eventId="event-detail" />);

    expect(await screen.findByRole("heading", { name: "Pre-Triage Summary" })).toBeInTheDocument();
    expect(screen.getByText("1 hour")).toBeInTheDocument();
    expect(screen.queryByText("Primary symptom")).not.toBeInTheDocument();
    expect(screen.queryByText("Pain intensity")).not.toBeInTheDocument();
    expect(screen.queryByText("Additional symptoms")).not.toBeInTheDocument();
  });

  it("does not render an empty summary when all values are absent or symptoms are empty", async () => {
    vi.mocked(beeexyPhase5Api.getClinicalHistoryEvent).mockResolvedValue(detail([], { additionalSymptoms: [] }));
    render(<ClinicalHistoryEventView eventId="event-detail" />);

    expect(await screen.findByText("Original event metadata")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pre-Triage Summary" })).not.toBeInTheDocument();
  });

  it("renders authoritative metadata and amendments in backend oldest-to-newest order", async () => {
    vi.mocked(beeexyPhase5Api.getClinicalHistoryEvent).mockResolvedValue(detail([
      amendment("amendment-1", "First correction", "2026-08-24T15:00:00Z"),
      amendment("amendment-2", "Second correction", "2026-08-24T16:00:00Z"),
    ]));
    render(<ClinicalHistoryEventView eventId="event-detail" />);

    const first = await screen.findByText("First correction");
    const second = screen.getByText("Second correction");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Original event metadata")).toBeInTheDocument();
    expect(screen.getByText(/never replace this original record/i)).toBeInTheDocument();
    expect(screen.getByText("Technical traceability")).toBeInTheDocument();
  });

  it("renders the empty correction state", async () => {
    vi.mocked(beeexyPhase5Api.getClinicalHistoryEvent).mockResolvedValue(detail());
    render(<ClinicalHistoryEventView eventId="event-detail" />);
    expect(await screen.findByText("No corrections have been added.")).toBeInTheDocument();
  });

  it("generates one UUID, blocks duplicate clicks, posts the source episode, and refreshes detail after 201", async () => {
    const saved = amendment("amendment-new", "Correct reported duration", "2026-08-24T17:00:00Z");
    vi.mocked(beeexyPhase5Api.getClinicalHistoryEvent).mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail([saved]));
    const pending = deferred<ClinicalHistoryAmendment>();
    vi.mocked(beeexyPhase5Api.createPreTriageAmendment).mockReturnValue(pending.promise);
    const key = "80000000-0000-0000-0000-000000000008" as `${string}-${string}-${string}-${string}-${string}`;
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(key);
    render(<ClinicalHistoryEventView eventId="event-detail" />);

    fireEvent.click(await screen.findByRole("button", { name: "Add correction" }));
    fireEvent.change(screen.getByLabelText("Reason for correction"), { target: { value: "  Correct reported duration  " } });
    const submit = screen.getByRole("button", { name: "Save correction" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(beeexyPhase5Api.createPreTriageAmendment).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();

    pending.resolve(saved);
    expect(await screen.findByText("Correction added.")).toBeInTheDocument();
    expect(screen.getByText("Correct reported duration")).toBeInTheDocument();
    expect(beeexyPhase5Api.createPreTriageAmendment).toHaveBeenCalledWith(episodeId, { idempotencyKey: key, reason: "Correct reported duration" });
    expect(beeexyPhase5Api.getClinicalHistoryEvent).toHaveBeenCalledTimes(2);
  });

  it("refetches and reconciles a 409 without generating or posting a new key", async () => {
    const reason = "Correction already committed";
    vi.mocked(beeexyPhase5Api.getClinicalHistoryEvent).mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail([amendment("amendment-existing", reason, "2026-08-24T17:00:00Z")]));
    vi.mocked(beeexyPhase5Api.createPreTriageAmendment).mockRejectedValue(new BeeexyApiError(409));
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID");
    render(<ClinicalHistoryEventView eventId="event-detail" />);

    fireEvent.click(await screen.findByRole("button", { name: "Add correction" }));
    fireEvent.change(screen.getByLabelText("Reason for correction"), { target: { value: reason } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));

    expect(await screen.findByText("Correction already saved.")).toBeInTheDocument();
    expect(beeexyPhase5Api.createPreTriageAmendment).toHaveBeenCalledTimes(1);
    expect(beeexyPhase5Api.getClinicalHistoryEvent).toHaveBeenCalledTimes(2);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("shows safe 422 validation and retains the same idempotency key for the corrected retry", async () => {
    const validation = new BeeexyApiError(422, { problem: { errorCode: "clinical_amendment.invalid_reason", detail: "Provide a clearer correction reason." } });
    const saved = amendment("amendment-new", "Clearer correction reason", "2026-08-24T17:00:00Z");
    vi.mocked(beeexyPhase5Api.getClinicalHistoryEvent).mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail([saved]));
    vi.mocked(beeexyPhase5Api.createPreTriageAmendment).mockRejectedValueOnce(validation).mockResolvedValueOnce(saved);
    const key = "80000000-0000-0000-0000-000000000009" as `${string}-${string}-${string}-${string}-${string}`;
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(key);
    render(<ClinicalHistoryEventView eventId="event-detail" />);

    fireEvent.click(await screen.findByRole("button", { name: "Add correction" }));
    const field = screen.getByLabelText("Reason for correction");
    fireEvent.change(field, { target: { value: "Correction" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    expect(await screen.findByText("Provide a clearer correction reason.")).toBeInTheDocument();

    fireEvent.change(field, { target: { value: "Clearer correction reason" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    expect(await screen.findByText("Correction added.")).toBeInTheDocument();
    expect(vi.mocked(beeexyPhase5Api.createPreTriageAmendment).mock.calls.map((call) => call[1].idempotencyKey)).toEqual([key, key]);
  });

  it("uses one generic state for a concealed or revoked-access 404 and refreshes accessible patients", async () => {
    vi.mocked(beeexyPhase5Api.getClinicalHistoryEvent).mockRejectedValue(new BeeexyApiError(404));
    render(<ClinicalHistoryEventView eventId="event-detail" />);
    expect(await screen.findByText("This record is unavailable")).toBeInTheDocument();
    expect(screen.getByText("This record is no longer available.")).toBeInTheDocument();
    await waitFor(() => expect(patientMocks.refreshPatients).toHaveBeenCalled());
  });
});
