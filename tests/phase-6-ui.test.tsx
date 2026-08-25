// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthDataExport } from "@/features/clinical-history/health-data-export";
import type { FhirExportMetadata } from "@/lib/beeexy-api/contracts";
import { beeexyPhase6Api } from "@/lib/beeexy-api/phase-6-api";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

const patientId = "10000000-0000-0000-0000-000000000001";
const eventId = "60000000-0000-0000-0000-000000000006";
const exportId = "90000000-0000-0000-0000-000000000009";
const key = "80000000-0000-0000-0000-000000000008" as `${string}-${string}-${string}-${string}-${string}`;

function metadata(status: FhirExportMetadata["status"] = "Validated", overrides: Partial<FhirExportMetadata> = {}): FhirExportMetadata {
  return {
    id: exportId,
    status,
    fhirVersion: "4.0.1",
    mappingVersion: "beeexy-fhir-r4-base-mvp-v1",
    createdAt: "2026-08-24T20:30:00Z",
    generatedAt: status === "Pending" ? null : "2026-08-24T20:30:00.010Z",
    validationCompletedAt: status === "Validated" || status === "ValidationFailed" ? "2026-08-24T20:30:00.020Z" : null,
    validation: status === "Validated"
      ? { outcome: "Passed", errorCount: 0, warningCount: 0, completedAt: "2026-08-24T20:30:00.020Z" }
      : status === "ValidationFailed"
        ? { outcome: "Failed", errorCount: 1, warningCount: 0, completedAt: "2026-08-24T20:30:00.020Z" }
        : null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, reject, resolve };
}

function renderExport(onUnavailable = vi.fn()) {
  return render(<HealthDataExport eventId={eventId} patientId={patientId} onUnavailable={onUnavailable} />);
}

beforeEach(() => {
  vi.spyOn(beeexyPhase6Api, "createFhirExport").mockReset();
  vi.spyOn(beeexyPhase6Api, "getFhirExport").mockReset();
  vi.spyOn(beeexyPhase6Api, "downloadFhirExport").mockReset();
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(key);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Health data export UI", () => {
  it("shows the initial action, blocks duplicate clicks, and uses the validated POST response directly", async () => {
    const pending = deferred<FhirExportMetadata>();
    vi.mocked(beeexyPhase6Api.createFhirExport).mockReturnValue(pending.promise);
    renderExport();

    const button = screen.getByRole("button", { name: "Export health record" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(beeexyPhase6Api.createFhirExport).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Preparing your health data…");
    expect(beeexyPhase6Api.createFhirExport).toHaveBeenCalledWith(patientId, {
      sourceClinicalHistoryEventId: eventId,
      idempotencyKey: key,
    }, expect.any(AbortSignal));
    expect(beeexyPhase6Api.getFhirExport).not.toHaveBeenCalled();

    pending.resolve(metadata());
    expect(await screen.findByText("Health data export ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download FHIR" })).toBeEnabled();
    expect(screen.getByText("Aug 24, 2026")).toBeInTheDocument();
  });

  it.each(["Pending", "Generated"] as const)("keeps download disabled for %s", async (status) => {
    vi.mocked(beeexyPhase6Api.createFhirExport).mockResolvedValue(metadata(status));
    renderExport();

    fireEvent.click(screen.getByRole("button", { name: "Export health record" }));

    expect(await screen.findByText("Preparing export…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download FHIR" })).toBeDisabled();
  });

  it("shows a safe ValidationFailed state without diagnostics", async () => {
    vi.mocked(beeexyPhase6Api.createFhirExport).mockResolvedValue(metadata("ValidationFailed"));
    renderExport();

    fireEvent.click(screen.getByRole("button", { name: "Export health record" }));

    expect(await screen.findByText("We couldn’t prepare this health data export.")).toBeInTheDocument();
    expect(screen.queryByText(/diagnostic|validator|checksum/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Download FHIR" })).not.toBeInTheDocument();
  });

  it("reuses one idempotency key after an ambiguous network failure", async () => {
    vi.mocked(beeexyPhase6Api.createFhirExport)
      .mockRejectedValueOnce(new BeeexyNetworkError())
      .mockResolvedValueOnce(metadata());
    renderExport();

    fireEvent.click(screen.getByRole("button", { name: "Export health record" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry export" }));

    expect(await screen.findByText("Health data export ready")).toBeInTheDocument();
    expect(vi.mocked(beeexyPhase6Api.createFhirExport).mock.calls.map((call) => call[1].idempotencyKey)).toEqual([key, key]);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("handles 409 safely without automatic resubmission", async () => {
    vi.mocked(beeexyPhase6Api.createFhirExport).mockRejectedValue(new BeeexyApiError(409, {
      problem: { detail: "The idempotency key belongs to different export inputs." },
    }));
    renderExport();

    fireEvent.click(screen.getByRole("button", { name: "Export health record" }));

    expect(await screen.findByText("We couldn’t prepare this export. Start a new export when you’re ready.")).toBeInTheDocument();
    expect(screen.queryByText(/idempotency key belongs/i)).not.toBeInTheDocument();
    expect(beeexyPhase6Api.createFhirExport).toHaveBeenCalledTimes(1);
  });

  it("uses generic concealed-404 handling and the existing safe 401 message", async () => {
    const unavailable = vi.fn();
    vi.mocked(beeexyPhase6Api.createFhirExport).mockRejectedValueOnce(new BeeexyApiError(404));
    const view = renderExport(unavailable);
    fireEvent.click(screen.getByRole("button", { name: "Export health record" }));
    await waitFor(() => expect(unavailable).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/permission|denied|revoked/i)).not.toBeInTheDocument();

    view.unmount();
    vi.mocked(beeexyPhase6Api.createFhirExport).mockRejectedValueOnce(new BeeexyApiError(401));
    renderExport();
    fireEvent.click(screen.getByRole("button", { name: "Export health record" }));
    expect(await screen.findByText("Your session has ended. Sign in again to continue.")).toBeInTheDocument();
  });

  it("downloads through Blob/object URL, triggers the anchor, revokes the URL, and persists nothing", async () => {
    vi.mocked(beeexyPhase6Api.createFhirExport).mockResolvedValue(metadata());
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "application/fhir+json" });
    vi.mocked(beeexyPhase6Api.downloadFhirExport).mockResolvedValue({ blob, fileName: `beeexy-fhir-export-${exportId}.json` });
    const createObjectURL = vi.fn(() => "blob:phase-6");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const localStorageWrite = vi.spyOn(Storage.prototype, "setItem");
    renderExport();

    fireEvent.click(screen.getByRole("button", { name: "Export health record" }));
    const download = await screen.findByRole("button", { name: "Download FHIR" });
    fireEvent.click(download);
    await waitFor(() => expect(beeexyPhase6Api.downloadFhirExport).toHaveBeenCalledWith(exportId, expect.any(AbortSignal)));

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector(`a[download="beeexy-fhir-export-${exportId}.json"]`)).toBeNull();
    expect(localStorageWrite).not.toHaveBeenCalled();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:phase-6"));
  });

  it("refreshes metadata and disables download after a content 409", async () => {
    vi.mocked(beeexyPhase6Api.createFhirExport).mockResolvedValue(metadata());
    vi.mocked(beeexyPhase6Api.downloadFhirExport).mockRejectedValue(new BeeexyApiError(409));
    vi.mocked(beeexyPhase6Api.getFhirExport).mockResolvedValue(metadata("Generated"));
    renderExport();

    fireEvent.click(screen.getByRole("button", { name: "Export health record" }));
    fireEvent.click(await screen.findByRole("button", { name: "Download FHIR" }));

    expect(await screen.findByText("Preparing export…")).toBeInTheDocument();
    expect(beeexyPhase6Api.getFhirExport).toHaveBeenCalledWith(exportId, expect.any(AbortSignal));
    expect(screen.getByRole("button", { name: "Download FHIR" })).toBeDisabled();
  });
});
