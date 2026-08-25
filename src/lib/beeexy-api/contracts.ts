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
  type?: string;
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

export type Uuid = string;
export type IsoTimestamp = string;

export type PreTriagePathway = "HEADACHE" | "ABDOMINAL_PAIN" | "FEVER";
export type AdditionalSymptom = "NAUSEA" | "DIARRHEA" | "FEVER";
export type DurationUnit = "MINUTES" | "HOURS" | "DAYS" | "WEEKS" | "MONTHS";
export type RequiredAnswerCode = "DURATION" | "INTENSITY" | "ADDITIONAL_SYMPTOMS";
export type NextQuestionAnswerType = "DURATION" | "INTEGER_SCALE" | "MULTIPLE_CHOICE";

export interface ClinicalDefinitionReference {
  code: string;
  version: string;
}

export interface ClinicalContentStatus {
  source: "PRODUCT_DEMO_DEFINED";
  reviewStatus: "NOT_APPLICABLE";
  clinicalApproval: "NOT_CLINICALLY_APPROVED";
}

export interface StartPreTriageRequest {
  pathway: PreTriagePathway;
  patientId?: Uuid;
}

interface PreTriageSessionStartCommon {
  sessionId: Uuid;
  pathway: PreTriagePathway;
  status: "Active";
  expiresAt: IsoTimestamp;
  questionnaire: ClinicalDefinitionReference;
  ruleSet: ClinicalDefinitionReference;
  clinicalContent: ClinicalContentStatus;
}

export type PreTriageSessionStartResponse =
  | (PreTriageSessionStartCommon & { patientId?: never; anonymousCapability: string })
  | (PreTriageSessionStartCommon & { patientId: Uuid; anonymousCapability?: never });

export interface DurationAnswer {
  value: number;
  unit: DurationUnit;
}

export interface StructuredPreTriageAnswers {
  duration?: DurationAnswer;
  intensity?: number;
  additionalSymptoms?: AdditionalSymptom[];
}

export type SubmitPreTriageAnswersRequest =
  | { questionnaireVersion?: string; structured: StructuredPreTriageAnswers; naturalLanguage?: never }
  | { questionnaireVersion?: string; structured?: never; naturalLanguage: string };

export interface NextQuestion {
  code: RequiredAnswerCode;
  prompt: string;
  answerType: NextQuestionAnswerType;
  allowedValues: string[];
  allowedUnits: DurationUnit[];
  minimum: number | null;
  maximum: number | null;
}

export type QuestionnaireProgressState = "IN_PROGRESS" | "READY_TO_COMPLETE";

export interface QuestionnaireProgress {
  state: QuestionnaireProgressState;
  answeredRequiredFields: RequiredAnswerCode[];
  missingRequiredFields: RequiredAnswerCode[];
  nextQuestion?: NextQuestion;
  readyToComplete: boolean;
}

export type TriageIntakeOutcome =
  | "ACCEPTED"
  | "CLARIFICATION_REQUIRED"
  | "SAFETY_RESTRICTED"
  | "UNSUPPORTED"
  | "PROVIDER_UNAVAILABLE";

export type IntakeClarificationCode =
  | "CLARIFICATION_REQUIRED"
  | "SAFETY_RESTRICTED"
  | "UNSUPPORTED_INPUT"
  | "INTERPRETATION_UNAVAILABLE"
  | "INVALID_INTERPRETATION";

export type ClinicalIntentClassification =
  | "PRE_TRIAGE_INPUT"
  | "OUT_OF_SCOPE"
  | "PRESCRIPTION_REQUEST"
  | "PROHIBITED_MEDICAL_ADVICE"
  | "POTENTIAL_PROMPT_INJECTION"
  | "UNSUPPORTED_CLINICAL_REQUEST"
  | "AMBIGUOUS";

export interface IntakeClarification {
  code: IntakeClarificationCode;
  classification?: ClinicalIntentClassification;
}

export interface PreTriageAnswerResponse {
  sessionId: Uuid;
  pathway: PreTriagePathway;
  questionnaireVersion: string;
  outcome: TriageIntakeOutcome;
  acceptedAnswers: RequiredAnswerCode[];
  progression: QuestionnaireProgress;
  clarification?: IntakeClarification;
}

export interface NeutralPreTriageResult {
  sessionId: Uuid;
  episodeId: Uuid;
  primarySymptom: {
    code: PreTriagePathway;
    display: "Headache" | "Stomach pain" | "Fever";
  };
  duration: DurationAnswer;
  intensity: number;
  additionalSymptoms: AdditionalSymptom[];
  completedAt: IsoTimestamp;
  questionnaire: ClinicalDefinitionReference;
  package: ClinicalDefinitionReference;
  clinicalContent: ClinicalContentStatus;
}

export type CompletePreTriageResponse = NeutralPreTriageResult;

export interface ClaimAnonymousPreTriageResponse {
  sessionId: Uuid;
  episodeId: Uuid;
  patientId: Uuid;
  claimedAt: IsoTimestamp;
}

export type ClinicalHistoryEventType = "COMPLETED_PRE_TRIAGE";
export type ClinicalHistorySourceType = "PRE_TRIAGE_EPISODE";
export type ClinicalHistoryAuthorType = "BEEEXY_ACCOUNT";

export interface ClinicalHistorySource {
  type: ClinicalHistorySourceType;
  id: Uuid;
  questionnaireVersionId: Uuid;
  clinicalRuleSetVersionId: Uuid;
}

export interface ClinicalHistoryProvenance {
  sourceType: ClinicalHistorySourceType;
  sourceId: Uuid;
  questionnaireVersionId: Uuid;
  clinicalRuleSetVersionId: Uuid;
}

export interface ClinicalHistoryItem {
  eventId: Uuid;
  eventType: ClinicalHistoryEventType;
  occurredAt: IsoTimestamp;
  recordedAt: IsoTimestamp;
  source: ClinicalHistorySource;
}

export interface ClinicalHistoryPage {
  items: ClinicalHistoryItem[];
  nextCursor: string | null;
}

export interface ClinicalHistoryAmendmentAuthor {
  type: ClinicalHistoryAuthorType;
  beeexyId: string | null;
}

export interface ClinicalHistoryAmendment {
  amendmentId: Uuid;
  reason: string;
  author: ClinicalHistoryAmendmentAuthor;
  createdAt: IsoTimestamp;
  provenance: ClinicalHistoryProvenance;
}

export interface ClinicalHistoryEventDetail extends ClinicalHistoryItem {
  provenance: ClinicalHistoryProvenance;
  amendments: ClinicalHistoryAmendment[];
}

export interface CreatePreTriageAmendmentRequest {
  idempotencyKey: Uuid;
  reason: string;
}

export type CreatePreTriageAmendmentResponse = ClinicalHistoryAmendment;

export interface ClinicalHistoryQuery {
  cursor?: string;
  pageSize?: number;
  eventType?: ClinicalHistoryEventType;
}

export type FhirExportStatus =
  | "Pending"
  | "Generated"
  | "ValidationFailed"
  | "Validated";

export type FhirExportValidationOutcome = "Failed" | "Passed";

export interface FhirExportValidationMetadata {
  outcome: FhirExportValidationOutcome;
  errorCount: number;
  warningCount: number;
  completedAt: IsoTimestamp;
}

export interface FhirExportMetadata {
  id: Uuid;
  status: FhirExportStatus;
  fhirVersion: string;
  mappingVersion: string;
  createdAt: IsoTimestamp;
  generatedAt: IsoTimestamp | null;
  validationCompletedAt: IsoTimestamp | null;
  validation: FhirExportValidationMetadata | null;
}

export interface CreateFhirExportRequest {
  sourceClinicalHistoryEventId: Uuid;
  idempotencyKey: Uuid;
}
