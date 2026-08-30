import { BeeexyApiClient } from "./api-client";
import { beeexyApiClient } from "./auth-api";
import type {
  ClinicDetail,
  ClinicPage,
  ClinicQuery,
  DoctorDetail,
  DoctorPage,
  DoctorQuery,
} from "./contracts";

type DirectoryQuery = ClinicQuery | DoctorQuery;

function appendDirectoryQuery(path: string, query: DirectoryQuery) {
  const parameters = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    parameters.set(key, String(value));
  }

  const encoded = parameters.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export class BeeexyPhase7Api {
  constructor(private readonly client: BeeexyApiClient) {}

  listClinics(query: ClinicQuery = {}, signal?: AbortSignal) {
    return this.client.requestPublic<ClinicPage>(
      appendDirectoryQuery("/api/v1/clinics", query),
      { expectedStatus: 200, signal },
    );
  }

  getClinic(clinicId: string, signal?: AbortSignal) {
    return this.client.requestPublic<ClinicDetail>(
      `/api/v1/clinics/${encodeURIComponent(clinicId)}`,
      { expectedStatus: 200, signal },
    );
  }

  searchDoctors(query: DoctorQuery = {}, signal?: AbortSignal) {
    return this.client.requestPublic<DoctorPage>(
      appendDirectoryQuery("/api/v1/doctors", query),
      { expectedStatus: 200, signal },
    );
  }

  getDoctor(doctorId: string, signal?: AbortSignal) {
    return this.client.requestPublic<DoctorDetail>(
      `/api/v1/doctors/${encodeURIComponent(doctorId)}`,
      { expectedStatus: 200, signal },
    );
  }
}

export const beeexyPhase7Api = new BeeexyPhase7Api(beeexyApiClient);
