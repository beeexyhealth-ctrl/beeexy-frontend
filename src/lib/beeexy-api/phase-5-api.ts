import { BeeexyApiClient } from "./api-client";
import { beeexyApiClient } from "./auth-api";
import type {
  ClinicalHistoryEventDetail,
  ClinicalHistoryPage,
  ClinicalHistoryQuery,
  CreatePreTriageAmendmentRequest,
  CreatePreTriageAmendmentResponse,
} from "./contracts";

export class BeeexyPhase5Api {
  constructor(private readonly client: BeeexyApiClient) {}

  getClinicalHistory(patientId: string, query: ClinicalHistoryQuery = {}, signal?: AbortSignal) {
    const search = new URLSearchParams();
    if (query.cursor !== undefined) search.set("cursor", query.cursor);
    if (query.pageSize !== undefined) search.set("pageSize", String(query.pageSize));
    if (query.eventType !== undefined) search.set("eventType", query.eventType);
    const suffix = search.size ? `?${search.toString()}` : "";

    return this.client.requestAuthenticated<ClinicalHistoryPage>(
      `/api/v1/patients/${encodeURIComponent(patientId)}/clinical-history${suffix}`,
      { expectedStatus: 200, signal },
    );
  }

  getClinicalHistoryEvent(patientId: string, eventId: string, signal?: AbortSignal) {
    return this.client.requestAuthenticated<ClinicalHistoryEventDetail>(
      `/api/v1/patients/${encodeURIComponent(patientId)}/clinical-history/${encodeURIComponent(eventId)}`,
      { expectedStatus: 200, signal },
    );
  }

  createPreTriageAmendment(
    episodeId: string,
    request: CreatePreTriageAmendmentRequest,
    signal?: AbortSignal,
  ) {
    return this.client.requestAuthenticated<CreatePreTriageAmendmentResponse>(
      `/api/v1/pre-triage/episodes/${encodeURIComponent(episodeId)}/amendments`,
      { method: "POST", body: request, expectedStatus: 201, signal },
    );
  }
}

export const beeexyPhase5Api = new BeeexyPhase5Api(beeexyApiClient);
