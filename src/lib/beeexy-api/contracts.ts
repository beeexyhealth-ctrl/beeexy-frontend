export interface EmailChallengeRequest {
  email: string;
}

export interface EmailVerificationRequest {
  email: string;
  code: string;
}

export interface GoogleAuthenticationRequest {
  credential: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AccountSummary {
  accountId: string;
  profileId: string;
  beeexyId: string;
}

export interface AuthenticationResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  account: AccountSummary;
}

export interface CurrentAccount {
  accountId: string;
  status: string;
  primaryProfile: {
    profileId: string;
    beeexyId: string;
  };
  preferences: Preferences;
}

export interface CurrentPatient {
  profileId: string;
  beeexyId: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  sexAssignedAtBirth: SexAssignedAtBirth | null;
  state: string | null;
  profileVersion: number;
  preferences: Preferences;
  version: number;
}

export interface Preferences {
  timezone: string;
}

export interface ProblemDetails {
  status?: number;
  title?: string;
  detail?: string;
  instance?: string;
  errorCode?: string;
  correlationId?: string;
}

export type RelationshipType =
  | "Parent"
  | "LegalGuardian"
  | "Caregiver"
  | "Spouse"
  | "Child"
  | "Sibling"
  | "Other";

export type RelationshipStatus = "Active" | "Revoked";
export type SexAssignedAtBirth = "Male" | "Female";
export type PatientAccessType = "Primary" | "Managed";

export interface AccessiblePatient {
  profileId: string;
  beeexyId: string;
  firstName: string | null;
  lastName: string | null;
  accessType: PatientAccessType;
  relationship: {
    relationshipId: string;
    type: RelationshipType;
  } | null;
}

export interface AccessiblePatientsResponse {
  patients: AccessiblePatient[];
}

export interface CareRelationship {
  id: string;
  subject: {
    profileId: string;
    beeexyId: string;
    firstName: string | null;
    lastName: string | null;
  };
  type: RelationshipType;
  status: RelationshipStatus;
  attestationVersion: string;
  attestedAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface CareRelationshipListResponse {
  relationships: CareRelationship[];
}

export interface PatientDetail {
  profileId: string;
  beeexyId: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  sexAssignedAtBirth: SexAssignedAtBirth | null;
  state: string | null;
  version: number;
}

export interface PatientDemographics {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sexAssignedAtBirth: SexAssignedAtBirth;
  state: string;
}

export interface CreateManagedPatientRequest {
  relationshipType: RelationshipType;
  attestationVersion: string;
  attestationAccepted: true;
  patient: PatientDemographics;
}

export interface CreateManagedPatientResponse {
  relationship: {
    id: string;
    type: RelationshipType;
    status: "Active";
    attestationVersion: string;
    attestedAt: string;
  };
  patient: PatientDemographics & {
    profileId: string;
    beeexyId: string;
    version: number;
  };
}

export interface UpdatePatientRequest {
  version: number;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  sexAssignedAtBirth?: SexAssignedAtBirth;
  state?: string;
}
