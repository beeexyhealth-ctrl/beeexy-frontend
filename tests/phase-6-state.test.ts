import { describe, expect, it } from "vitest";
import type { FhirExportMetadata } from "@/lib/beeexy-api/contracts";
import {
  createFhirExportErrorPresentation,
  downloadFhirExportErrorPresentation,
  isFhirExportDownloadCandidate,
} from "@/features/clinical-history/fhir-export-state";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

function metadata(overrides: Partial<FhirExportMetadata> = {}): FhirExportMetadata {
  return {
    id: "export-id",
    status: "Validated",
    fhirVersion: "4.0.1",
    mappingVersion: "beeexy-fhir-r4-base-mvp-v1",
    createdAt: "2026-08-24T20:30:00Z",
    generatedAt: "2026-08-24T20:30:00Z",
    validationCompletedAt: "2026-08-24T20:30:00Z",
    validation: { outcome: "Passed", errorCount: 0, warningCount: 0, completedAt: "2026-08-24T20:30:00Z" },
    ...overrides,
  };
}

describe("Phase 6 client state rules", () => {
  it("allows download only for the exact current validated specification", () => {
    expect(isFhirExportDownloadCandidate(metadata())).toBe(true);
    expect(isFhirExportDownloadCandidate(metadata({ status: "Pending" }))).toBe(false);
    expect(isFhirExportDownloadCandidate(metadata({ status: "Generated" }))).toBe(false);
    expect(isFhirExportDownloadCandidate(metadata({ status: "ValidationFailed" }))).toBe(false);
    expect(isFhirExportDownloadCandidate(metadata({ fhirVersion: "legacy" }))).toBe(false);
    expect(isFhirExportDownloadCandidate(metadata({ mappingVersion: "legacy" }))).toBe(false);
  });

  it("keeps retry semantics safe and never exposes backend details", () => {
    const validation = createFhirExportErrorPresentation(new BeeexyApiError(422, {
      problem: { detail: "Raw validator diagnostics must stay hidden" },
    }));
    expect(validation.retry).toBe("fresh");
    expect(validation.message).not.toMatch(/validator diagnostics/i);
    expect(createFhirExportErrorPresentation(new BeeexyNetworkError()).retry).toBe("same");
    expect(createFhirExportErrorPresentation(new BeeexyApiError(503)).retry).toBe("same");
    expect(downloadFhirExportErrorPresentation(new BeeexyApiError(409))).toMatchObject({ retry: "none" });
  });
});
