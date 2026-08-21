import { BeeexyApiClient } from "./api-client";
import { beeexyApiClient } from "./auth-api";
import type {
  AccessiblePatientsResponse,
  CareRelationshipListResponse,
  CreateManagedPatientRequest,
  CreateManagedPatientResponse,
  PatientDetail,
  UpdatePatientRequest,
} from "./contracts";

export class BeeexyPhase3Api {
  constructor(private readonly client: BeeexyApiClient) {}

  listAccessiblePatients() {
    return this.client.requestAuthenticated<AccessiblePatientsResponse>("/api/v1/patients", { expectedStatus: 200 });
  }

  createManagedPatient(request: CreateManagedPatientRequest) {
    return this.client.requestAuthenticated<CreateManagedPatientResponse>("/api/v1/care-relationships", {
      method: "POST",
      body: request,
      expectedStatus: 201,
    });
  }

  listCareRelationships() {
    return this.client.requestAuthenticated<CareRelationshipListResponse>("/api/v1/care-relationships", { expectedStatus: 200 });
  }

  getPatient(patientId: string) {
    return this.client.requestAuthenticated<PatientDetail>(`/api/v1/patients/${encodeURIComponent(patientId)}`, { expectedStatus: 200 });
  }

  updatePatient(patientId: string, patch: UpdatePatientRequest) {
    return this.client.requestAuthenticated<PatientDetail>(`/api/v1/patients/${encodeURIComponent(patientId)}`, {
      method: "PATCH",
      body: patch,
      expectedStatus: 200,
    });
  }

  revokeCareRelationship(relationshipId: string) {
    return this.client.requestAuthenticated<void>(`/api/v1/care-relationships/${encodeURIComponent(relationshipId)}`, {
      method: "DELETE",
      expectedStatus: 204,
    });
  }
}

export const beeexyPhase3Api = new BeeexyPhase3Api(beeexyApiClient);
