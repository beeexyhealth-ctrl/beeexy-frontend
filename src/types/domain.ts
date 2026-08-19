export type SubjectRef =
  | { kind: "user"; id: string }
  | { kind: "dependent"; id: string };

export type SexAtBirth = "female" | "male" | "prefer_not_to_say";
export type AgeRange = "0_17" | "18_29" | "30_49" | "50_64" | "65_plus";

export interface PreTriageAnswers {
  symptom: string;
  sexAtBirth: SexAtBirth;
  ageRange: AgeRange;
  watchedEducation: boolean | null;
  viewedTimeline: boolean | null;
  duration: string | null;
  painLevel: number | null;
  otherSymptoms: string | null;
}

export interface AssessmentResult {
  source: "demo_fixture" | "team_clinical_service";
  fixtureVersion?: string;
  urgencyLabel: string;
  possibleConditions: Array<{
    label: string;
    displayPercentage?: number;
    description?: string;
  }>;
  disclaimer: string;
}

export interface PreTriageSession {
  id: string;
  userId: string;
  dependentId: string | null;
  status: "draft" | "completed";
  currentStep: number;
  answers: Partial<PreTriageAnswers>;
  result: AssessmentResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface Doctor {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  bio: string;
  rating: number;
  reviewCount: number;
  distanceMiles: number;
  languages: string[];
  insurances: string[];
  locationName: string;
  address: string;
  boardCertified: boolean;
  photoUrl?: string;
  subspecialty?: string;
  yearsExperience?: number;
  aiMatchScore?: number;
  videoVisit?: boolean;
  tagline?: string;
}

export interface DoctorSlot {
  id: string;
  doctorId: string;
  startsAt: string;
  modality: "in_person" | "video";
  clinicTimeZone: string;
}

export interface Appointment {
  id: string;
  userId: string;
  dependentId: string | null;
  doctorId: string;
  doctorSlotId: string;
  reason: string | null;
  modality: "in_person" | "video";
  status: "confirmed" | "cancelled" | "completed";
  reminderEnabled: boolean;
  createdAt: string;
  doctor?: Doctor;
  slot?: DoctorSlot;
}

export interface Dependent {
  id: string;
  ownerUserId: string;
  relationship: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  sexAtBirth: SexAtBirth;
  state: string;
}
