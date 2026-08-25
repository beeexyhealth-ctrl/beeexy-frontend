import { BeeexyApiClient } from "./api-client";
import { beeexyApiClient } from "./auth-api";
import type { CreateFhirExportRequest, FhirExportMetadata } from "./contracts";

export interface FhirExportDownload {
  blob: Blob;
  fileName: string;
}

export class BeeexyPhase6Api {
  constructor(private readonly client: BeeexyApiClient) {}

  createFhirExport(patientId: string, request: CreateFhirExportRequest, signal?: AbortSignal) {
    return this.client.requestAuthenticated<FhirExportMetadata>(
      `/api/v1/patients/${encodeURIComponent(patientId)}/fhir-exports`,
      { method: "POST", body: request, expectedStatus: [200, 201], signal },
    );
  }

  getFhirExport(exportId: string, signal?: AbortSignal) {
    return this.client.requestAuthenticated<FhirExportMetadata>(
      `/api/v1/fhir-exports/${encodeURIComponent(exportId)}`,
      { expectedStatus: 200, signal },
    );
  }

  async downloadFhirExport(exportId: string, signal?: AbortSignal): Promise<FhirExportDownload> {
    const response = await this.client.requestAuthenticatedRaw(
      `/api/v1/fhir-exports/${encodeURIComponent(exportId)}/content`,
      {
        expectedStatus: 200,
        headers: { Accept: "application/fhir+json" },
        signal,
      },
    );
    const fallback = fallbackFhirExportFilename(exportId);

    return {
      blob: await response.blob(),
      fileName: filenameFromContentDisposition(response.headers.get("content-disposition"), fallback),
    };
  }
}

export function saveFhirExportFile(download: FhirExportDownload) {
  const objectUrl = URL.createObjectURL(download.blob);
  const anchor = document.createElement("a");

  try {
    anchor.href = objectUrl;
    anchor.download = download.fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export function filenameFromContentDisposition(value: string | null, fallback: string) {
  if (!value) return fallback;

  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return safeDownloadFilename(decodeURIComponent(utf8[1].trim()), fallback);
    } catch {
      return fallback;
    }
  }

  const basic = value.match(/filename="?([^";]+)"?/i);
  return safeDownloadFilename(basic?.[1]?.trim(), fallback);
}

function fallbackFhirExportFilename(exportId: string) {
  const safeId = exportId.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `beeexy-fhir-export-${safeId || "export"}.json`;
}

function safeDownloadFilename(value: string | undefined, fallback: string) {
  return value && /^[a-zA-Z0-9._-]+\.json$/.test(value) ? value : fallback;
}

export const beeexyPhase6Api = new BeeexyPhase6Api(beeexyApiClient);
