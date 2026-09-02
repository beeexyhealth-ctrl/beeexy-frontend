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

export interface ClinicQuery {
  cursor?: string;
  pageSize?: number;
  code?: string;
  locality?: string;
  administrativeArea?: string;
  country?: string;
}

export interface ClinicSummary {
  clinicId: string;
  code: string;
  name: string;
}

export interface ClinicPage {
  items: ClinicSummary[];
  nextCursor: string | null;
}

export interface ClinicLocation {
  locationId: string;
  name: string;
  locality: string;
  administrativeArea: string;
  country: string;
  timeZone: string;
}

export interface ClinicDetail {
  clinicId: string;
  code: string;
  name: string;
  locations: ClinicLocation[];
}

export interface DoctorQuery {
  cursor?: string;
  pageSize?: number;
  specialtyCode?: string;
  languageCode?: string;
  locality?: string;
  administrativeArea?: string;
  country?: string;
  insurancePlanCode?: string;
}

export interface DirectoryCatalogValue {
  code: string;
  name: string;
}

export type DoctorSpecialty = DirectoryCatalogValue;
export type DoctorLanguage = DirectoryCatalogValue;
export type StoredInsuranceParticipation = DirectoryCatalogValue;

export interface DoctorAffiliationLocation {
  locationId: string;
  name: string;
  locality: string;
  administrativeArea: string;
  country: string;
  timeZone: string;
}

export interface DoctorAffiliation {
  clinicId: string;
  clinicCode: string;
  clinicName: string;
  location: DoctorAffiliationLocation | null;
}

export interface VerifiedDemoCredential {
  name: string;
}

export interface DoctorProfile {
  doctorId: string;
  code: string;
  displayName: string;
  specialties: DoctorSpecialty[];
  languages: DoctorLanguage[];
  affiliations: DoctorAffiliation[];
  storedInsuranceParticipations: StoredInsuranceParticipation[];
  credentials: VerifiedDemoCredential[];
}

export type DoctorMatchFactorState = "matched" | "not_matched" | "not_applicable";

export type DoctorMatchFactorCode =
  | "specialty_exact"
  | "language_exact"
  | "location_exact"
  | "stored_insurance_participation_exact";

export type DoctorMatchRuleVersion = "2026.08.29-demo.1";

export type DoctorMatchSemanticsVersion =
  | "exact_canonical_doctor_specialty_relationship_v1"
  | "exact_canonical_doctor_language_relationship_v1"
  | "exact_same_eligible_affiliation_location_fields_v1"
  | "exact_stored_doctor_insurance_participation_v1";

export interface DoctorMatchExplanationValue {
  key: string;
  value: string;
}

export interface DoctorMatchFactor {
  factorCode: DoctorMatchFactorCode;
  semanticsVersion: DoctorMatchSemanticsVersion;
  configuredWeightPoints: number;
  state: DoctorMatchFactorState;
  contributionPoints: number;
  explanationCode: string;
  explanationData: DoctorMatchExplanationValue[];
}

export interface DoctorMatch {
  ruleVersion: DoctorMatchRuleVersion;
  matchScore: number;
  factors: DoctorMatchFactor[];
}

export interface DoctorSearchItem extends DoctorProfile {
  match?: DoctorMatch;
}

export interface DoctorPage {
  items: DoctorSearchItem[];
  nextCursor: string | null;
}

export type DoctorDetail = DoctorProfile;

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

export type PreTriagePathway =
  | "HEADACHE"
  | "ABDOMINAL_PAIN"
  | "CHEST_PAIN"
  | "FEVER"
  | "OTHER_SYMPTOMS";
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

export type ConversationSessionStatus = "ACTIVE" | "COMPLETED";
export type ConversationState = "IN_PROGRESS" | "READY_FOR_REVIEW" | "COMPLETED";
export type ConversationInputType = "DURATION" | "SCALE" | "MULTI_SELECT" | "SINGLE_SELECT";
export type EducationalVideoDecision = "WATCH" | "SKIP";

export interface ConversationPathway {
  code: PreTriagePathway;
  label: string;
}

export interface ConversationProgress {
  completed: number;
  total: number;
  percentage: number;
}

export interface ConversationOption<TValue extends string = string> {
  value: TValue;
  label: string;
}

interface ConversationQuestionInteractionCommon {
  type: "QUESTION";
  questionCode: RequiredAnswerCode;
  prompt: string;
  required: boolean;
}

export type ConversationQuestionInteraction =
  | (ConversationQuestionInteractionCommon & {
      field: "duration";
      inputType: "DURATION";
      constraints: {
        minimum: number;
        exclusiveMinimum: boolean;
        allowedUnits: DurationUnit[];
      };
      options: [];
    })
  | (ConversationQuestionInteractionCommon & {
      field: "intensity";
      inputType: "SCALE";
      constraints: {
        minimum: number;
        maximum: number;
        step: number;
      };
      options: [];
    })
  | (ConversationQuestionInteractionCommon & {
      field: "additionalSymptoms";
      inputType: "MULTI_SELECT";
      constraints: {
        minimumSelections: number;
        maximumSelections: number;
        allowsEmptySelection: boolean;
      };
      options: ConversationOption<AdditionalSymptom>[];
    });

export interface EducationalVideo {
  id: string;
  title: string;
  url: string;
}

export interface EducationalVideoOfferInteraction {
  type: "EDUCATIONAL_VIDEO_OFFER";
  field: "educationalVideoDecision";
  prompt: string;
  inputType: "SINGLE_SELECT";
  required: false;
  constraints: {
    minimumSelections: 1;
    maximumSelections: 1;
    allowsEmptySelection: false;
  };
  options: Array<ConversationOption<EducationalVideoDecision>>;
  video: EducationalVideo;
  questionCode?: never;
}

export type ConversationNextInteraction = ConversationQuestionInteraction | EducationalVideoOfferInteraction;

export interface PreTriageConversationProjection {
  sessionId: Uuid;
  sessionStatus: ConversationSessionStatus;
  state: ConversationState;
  expiresAt: IsoTimestamp;
  pathway: ConversationPathway;
  questionnaire: ClinicalDefinitionReference;
  ruleSet: ClinicalDefinitionReference;
  progress: ConversationProgress;
  acceptedValues: StructuredPreTriageAnswers;
  /** Omitted by the backend once the conversation is ready for review or completed. */
  nextInteraction?: ConversationNextInteraction;
}

export interface StartPreTriageRequest {
  pathway: PreTriagePathway;
  patientId?: Uuid;
}

interface PreTriageSessionCommon {
  sessionId: Uuid;
  pathway: PreTriagePathway;
  status: "Active";
  expiresAt: IsoTimestamp;
  questionnaire: ClinicalDefinitionReference;
  ruleSet: ClinicalDefinitionReference;
  clinicalContent: ClinicalContentStatus;
}

interface PreTriageSessionStartCommon extends PreTriageSessionCommon {
  conversation: PreTriageConversationProjection;
}

export type PreTriageSessionStartResponse =
  | (PreTriageSessionStartCommon & { patientId?: never; anonymousCapability: string })
  | (PreTriageSessionStartCommon & { patientId: Uuid; anonymousCapability?: never });

export interface StartPreTriageFromIntakeRequest {
  text: string;
}

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
  acceptedValues: StructuredPreTriageAnswers | null;
  progression: QuestionnaireProgress;
  conversation: PreTriageConversationProjection;
  clarification?: IntakeClarification;
}

export interface ResolveEducationalVideoOfferRequest {
  decision: EducationalVideoDecision;
}

export interface ResolveEducationalVideoOfferResponse {
  sessionId: Uuid;
  decision: EducationalVideoDecision;
  resolvedAt: IsoTimestamp;
  newlyResolved: boolean;
  conversation: PreTriageConversationProjection;
}

export type PreTriageIntakeSessionResponse =
  | (PreTriageSessionCommon & { patientId?: never; anonymousCapability: string })
  | (PreTriageSessionCommon & { patientId: Uuid; anonymousCapability?: never });

export type PreTriageIntakeInitialAnswers = Omit<PreTriageAnswerResponse, "conversation">;

export type StartPreTriageFromIntakeResponse =
  | {
      resolution: "RESOLVED";
      candidatePathways?: never;
      session: PreTriageIntakeSessionResponse;
      initialAnswers: PreTriageIntakeInitialAnswers;
      conversation: PreTriageConversationProjection;
    }
  | {
      resolution: "AMBIGUOUS";
      candidatePathways?: PreTriagePathway[];
      session?: never;
      initialAnswers?: never;
      conversation?: never;
    }
  | {
      resolution: "UNRESOLVED";
      candidatePathways?: never;
      session?: never;
      initialAnswers?: never;
      conversation?: never;
    };

export interface NeutralPreTriageResult {
  sessionId: Uuid;
  episodeId: Uuid;
  primarySymptom: {
    code: PreTriagePathway;
    display: "Headache" | "Stomach pain" | "Chest pain" | "Fever" | "Other symptoms";
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
  primarySymptom: {
    code: PreTriagePathway;
    display: string;
  } | null;
  duration: DurationAnswer | null;
  intensity: number | null;
  additionalSymptoms: AdditionalSymptom[] | null;
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

// Phase 8 availability and appointment transport contracts.
export type IsoInstant = string;
export type IanaTimeZone = string;

export type AppointmentStatus =
  | "Requested"
  | "Confirmed"
  | "Cancelled"
  | "Completed"
  | "NoShow"
  | "Rejected";

export type AppointmentModality = "inPerson" | "virtual";

export interface AvailabilitySlot {
  slotId: Uuid;
  doctorId: Uuid;
  clinicId: Uuid;
  locationId: Uuid;
  startsAt: IsoInstant;
  endsAt: IsoInstant;
  clinicTimeZone: IanaTimeZone;
  modality: AppointmentModality;
}

export interface RequestAppointmentRequest {
  patientId: Uuid;
  slotId: Uuid;
  modality: AppointmentModality;
  reason?: string | null;
  idempotencyKey: Uuid;
}

export interface AppointmentSummary {
  appointmentId: Uuid;
  patientId: Uuid;
  slotId: Uuid;
  doctorId: Uuid;
  clinicId: Uuid;
  locationId: Uuid;
  status: AppointmentStatus;
  modality: AppointmentModality;
  startsAt: IsoInstant;
  endsAt: IsoInstant;
  clinicTimeZone: IanaTimeZone;
  createdAt: IsoInstant;
}

export interface RequestAppointmentResponse extends AppointmentSummary {
  reason?: string;
}

export type AppointmentHistoryActorType =
  | "patientAuthority"
  | "appointmentScheduler";

export type AppointmentStatusAction =
  | "creation"
  | "confirmation"
  | "rejection"
  | "cancellation"
  | "completion"
  | "noShow";

export interface AppointmentStatusHistoryEntry {
  sequence: number;
  previousStatus: AppointmentStatus | null;
  newStatus: AppointmentStatus;
  actorType: AppointmentHistoryActorType;
  action: AppointmentStatusAction;
  occurredAt: IsoInstant;
}

export interface AppointmentRescheduleHistoryEntry {
  previousSlotId: Uuid;
  newSlotId: Uuid;
  occurredAt: IsoInstant;
}

export interface AppointmentDetail extends AppointmentSummary {
  reason?: string;
  statusHistory: AppointmentStatusHistoryEntry[];
  rescheduleHistory: AppointmentRescheduleHistoryEntry[];
}

export interface AppointmentPage {
  items: AppointmentSummary[];
  nextCursor: string | null;
}

export interface RescheduleAppointmentRequest {
  slotId: Uuid;
}

export interface AvailabilityQuery {
  from?: IsoInstant;
  to?: IsoInstant;
}

export interface AppointmentListQuery {
  patientId?: Uuid;
  status?: AppointmentStatus;
  from?: IsoInstant;
  to?: IsoInstant;
  cursor?: string;
  pageSize?: number;
}

export type Phase8ErrorCode =
  | "availability.range_invalid"
  | "availability.filter_unsupported"
  | "scheduling.appointment_scheduler_forbidden"
  | "scheduling.appointment_target_not_found"
  | "scheduling.slot_reserved"
  | "scheduling.idempotency_key_reused"
  | "scheduling.appointment_transition_conflict"
  | "scheduling.appointment_reschedule_conflict"
  | "scheduling.unsupported_field"
  | "scheduling.identifiers_required"
  | "scheduling.modality_invalid"
  | "scheduling.modality_mismatch"
  | "scheduling.reason_invalid"
  | "scheduling.slot_expired"
  | "scheduling.slot_unbookable"
  | "scheduling.appointment_filter_unsupported"
  | "scheduling.appointment_filter_invalid"
  | "scheduling.appointment_status_invalid"
  | "scheduling.appointment_range_invalid"
  | "scheduling.appointment_page_size_invalid"
  | "scheduling.appointment_cursor_invalid";

export type Phase8ProblemDetails = Omit<ProblemDetails, "errorCode"> & {
  errorCode?: Phase8ErrorCode;
};

// Phase 10 AI transport contracts.
export type AiConversationPurpose =
  | "GENERAL_HEALTH"
  | "MEDICAL_TERMS"
  | "SYMPTOM_DISCUSSION"
  | "CLINICIAN_QUESTIONS";

export type AiMessageRole = "user" | "assistant";

export type AiConversationExecutionStatus =
  | "completed"
  | "rejected"
  | "failed";

export interface AiDisclaimer {
  version: string;
  content: string;
}

export interface CreateAiConversationRequest {
  purpose: AiConversationPurpose;
  patientId?: Uuid | null;
}

export interface AiConversation {
  conversationId: Uuid;
  patientId: Uuid | null;
  createdAt: IsoInstant;
  disclaimer: AiDisclaimer;
}

export interface AiConversationSummary {
  conversationId: Uuid;
  patientId: Uuid | null;
  createdAt: IsoInstant;
}

export interface AiConversationPage {
  items: AiConversationSummary[];
  nextCursor: string | null;
}

export interface ListAiConversationsQuery {
  cursor?: string;
  pageSize?: number;
}

export interface AiConversationMessage {
  messageId: Uuid;
  role: AiMessageRole;
  content: string;
  sequence: number;
  createdAt: IsoInstant;
}

export interface AiConversationDetail {
  conversation: AiConversationSummary;
  messages: AiConversationMessage[];
  disclaimer: AiDisclaimer;
}

export interface SendAiConversationMessageRequest {
  content: string;
}

export interface AiConversationExecution {
  conversationId: Uuid;
  userMessageId: Uuid;
  executionId: Uuid;
  status: AiConversationExecutionStatus;
  assistantMessage?: AiConversationMessage;
  disclaimer: AiDisclaimer;
}

export type AiDocumentStatus = "active" | "deleted" | "expired";

export interface AiDocument {
  documentId: Uuid;
  contentType: "application/pdf" | "text/plain";
  sizeBytes: number;
  uploadedAt: IsoInstant;
  expiresAt: IsoInstant;
  status: AiDocumentStatus;
}

export interface RequestSecondOpinionRequest {
  patientId: Uuid;
  text?: string | null;
  documentIds?: Uuid[] | null;
  preTriageSessionId?: Uuid | null;
  clinicalHistoryEventIds?: Uuid[] | null;
}

export type SecondOpinionTerminalStatus =
  | "succeeded"
  | "failed"
  | "rejected";

export type SecondOpinionStatus =
  | "pending"
  | "running"
  | SecondOpinionTerminalStatus;

export interface SecondOpinionAccepted {
  analysisId: Uuid;
  executionId: Uuid;
  status: SecondOpinionTerminalStatus;
  statusUrl: string;
}

export interface SecondOpinionResult {
  summary: string;
  importantPoints: string[];
  possibleQuestionsForDoctor: string[];
  missingInformation: string[];
  disclaimer: string;
}

export interface SecondOpinionMetadata {
  aiGenerated: boolean;
  generatedAt: IsoInstant;
  resultVersion: string;
  provider?: string;
  modelVersion?: string;
  promptVersion?: string;
  disclaimerVersion: string;
}

export interface SecondOpinion {
  analysisId: Uuid;
  patientId: Uuid;
  executionId?: Uuid;
  status: SecondOpinionStatus;
  result?: SecondOpinionResult;
  metadata?: SecondOpinionMetadata;
  safeMessage?: string;
}

export type Phase10ErrorCode =
  | "ai.conversation.purpose_invalid"
  | "ai.conversation.message_invalid"
  | "ai.conversation.request_not_supported"
  | "ai.conversation.message_limit_reached"
  | "ai.conversation.page_size_invalid"
  | "ai.conversation.cursor_invalid"
  | "ai.conversation.unsupported_field"
  | "ai.conversation.not_found"
  | "ai.conversation.execution_conflict"
  | "ai.document.single_file_required"
  | "ai.document.too_large"
  | "ai.document.unsupported_media"
  | "ai.document.empty"
  | "ai.document.size_mismatch"
  | "ai.document.file_unsafe"
  | "ai.document.unusable_text"
  | "ai.document.not_found"
  | "ai.second_opinion.unsupported_field"
  | "ai.second_opinion.source_ids_invalid"
  | "ai.second_opinion.input_required"
  | "ai.second_opinion.text_invalid"
  | "ai.second_opinion.document_limit"
  | "ai.second_opinion.history_limit"
  | "ai.second_opinion.document_unavailable"
  | "ai.second_opinion.document_text_unavailable"
  | "ai.second_opinion.not_found"
  | "ai.second_opinion.execution_conflict"
  | "ai.second_opinion.regeneration_body_not_allowed"
  | "ai.second_opinion.immutable_input_invalid";

export type Phase10ProblemDetails = Omit<ProblemDetails, "errorCode"> & {
  errorCode?: Phase10ErrorCode;
};
