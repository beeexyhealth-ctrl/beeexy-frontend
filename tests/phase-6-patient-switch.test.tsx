// @vitest-environment jsdom

import type { AnchorHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import type { ClinicalHistoryEventDetail, FhirExportMetadata } from "@/lib/beeexy-api/contracts";
import { beeexyPhase5Api } from "@/lib/beeexy-api/phase-5-api";
import { beeexyPhase6Api } from "@/lib/beeexy-api/phase-6-api";

const eventId = "60000000-0000-0000-0000-000000000006";

function detail(sourceId: string): ClinicalHistoryEventDetail {
  const source = {
    type: "PRE_TRIAGE_EPISODE" as const,
    id: sourceId,
    questionnaireVersionId: "30000000-0000-0000-0000-000000000003",
    clinicalRuleSetVersionId: "40000000-0000-0000-0000-000000000004",
  };
  return {
    eventId,
    eventType: "COMPLETED_PRE_TRIAGE",
    occurredAt: "2026-08-24T14:30:00Z",
    recordedAt: "2026-08-24T14:30:00Z",
    source,
    primarySymptom: null,
    duration: null,
    intensity: null,
    additionalSymptoms: null,
    provenance: { sourceType: source.type, sourceId, questionnaireVersionId: source.questionnaireVersionId, clinicalRuleSetVersionId: source.clinicalRuleSetVersionId },
    amendments: [],
  };
}

function validated(): FhirExportMetadata {
  return {
    id: "90000000-0000-0000-0000-000000000009",
    status: "Validated",
    fhirVersion: "4.0.1",
    mappingVersion: "beeexy-fhir-r4-base-mvp-v1",
    createdAt: "2026-08-24T20:30:00Z",
    generatedAt: "2026-08-24T20:30:00Z",
    validationCompletedAt: "2026-08-24T20:30:00Z",
    validation: { outcome: "Passed", errorCount: 0, warningCount: 0, completedAt: "2026-08-24T20:30:00Z" },
  };
}

beforeEach(() => {
  patientMocks.activePatient = { profileId: "patient-a", beeexyId: "BXY-A", firstName: "Alex", lastName: "Rivera", accessType: "Primary", relationship: null };
  vi.spyOn(beeexyPhase5Api, "getClinicalHistoryEvent").mockImplementation(async (patientId) => detail(`episode-${patientId}`));
  vi.spyOn(beeexyPhase6Api, "createFhirExport").mockResolvedValue(validated());
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("80000000-0000-0000-0000-000000000008");
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Phase 6 patient scope", () => {
  it("clears export metadata and intent state when the active patient changes", async () => {
    const view = render(<ClinicalHistoryEventView eventId={eventId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Export health record" }));
    expect(await screen.findByText("Health data export ready")).toBeInTheDocument();

    patientMocks.activePatient = { ...patientMocks.activePatient, profileId: "patient-b", beeexyId: "BXY-B", firstName: "Bailey" };
    view.rerender(<ClinicalHistoryEventView eventId={eventId} />);

    expect(await screen.findByRole("button", { name: "Export health record" })).toBeInTheDocument();
    expect(screen.queryByText("Health data export ready")).not.toBeInTheDocument();
    await waitFor(() => expect(beeexyPhase5Api.getClinicalHistoryEvent).toHaveBeenCalledWith("patient-b", eventId, expect.any(AbortSignal)));
    expect(beeexyPhase6Api.createFhirExport).toHaveBeenCalledTimes(1);
  });
});
