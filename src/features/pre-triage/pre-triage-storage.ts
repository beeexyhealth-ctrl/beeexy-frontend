import type {
  NeutralPreTriageResult,
  PreTriagePathway,
  QuestionnaireProgress,
  StructuredPreTriageAnswers,
} from "@/lib/beeexy-api/contracts";

export const ANONYMOUS_PRE_TRIAGE_STORAGE_KEY = "beeexy:pre-triage:anonymous";

export interface StoredAnonymousPreTriage {
  sessionId: string;
  pathway: PreTriagePathway;
  questionnaireVersion: string;
  expiresAt: string;
  anonymousCapability: string;
  progression?: QuestionnaireProgress;
  acceptedAnswers?: StructuredPreTriageAnswers;
  result?: NeutralPreTriageResult;
  pendingClaim?: boolean;
}

export function readAnonymousPreTriage(now = Date.now()): StoredAnonymousPreTriage | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(ANONYMOUS_PRE_TRIAGE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<StoredAnonymousPreTriage>;
    if (!isStoredAnonymousPreTriage(stored) || Date.parse(stored.expiresAt) <= now) {
      clearAnonymousPreTriage();
      return null;
    }
    return stored;
  } catch {
    clearAnonymousPreTriage();
    return null;
  }
}

export function writeAnonymousPreTriage(state: StoredAnonymousPreTriage) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ANONYMOUS_PRE_TRIAGE_STORAGE_KEY, JSON.stringify(state));
}

export function clearAnonymousPreTriage() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ANONYMOUS_PRE_TRIAGE_STORAGE_KEY);
}

function isStoredAnonymousPreTriage(value: Partial<StoredAnonymousPreTriage>): value is StoredAnonymousPreTriage {
  return Boolean(
    typeof value.sessionId === "string" && value.sessionId &&
    typeof value.pathway === "string" && ["HEADACHE", "ABDOMINAL_PAIN", "FEVER"].includes(value.pathway) &&
    typeof value.questionnaireVersion === "string" && value.questionnaireVersion &&
    typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt)) &&
    typeof value.anonymousCapability === "string" && value.anonymousCapability,
  );
}
