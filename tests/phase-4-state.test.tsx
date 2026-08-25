import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { NeutralPreTriageResult, QuestionnaireProgress } from "@/lib/beeexy-api/contracts";
import {
  allowedAdditionalSymptoms,
  PreTriageReviewSummary,
  questionForProgression,
  ResultSummary,
  SUPPORTED_PATHWAYS,
} from "@/features/pre-triage/pre-triage-flow";
import { intakeOutcomeMessage, preTriageErrorMessage } from "@/features/pre-triage/pre-triage-errors";
import { claimedPreTriageState, mergeAcceptedAnswers, shouldReconcileClaim, validateAnswerRequest } from "@/features/pre-triage/pre-triage-provider";
import {
  ANONYMOUS_PRE_TRIAGE_STORAGE_KEY,
  clearAnonymousPreTriage,
  readAnonymousPreTriage,
  writeAnonymousPreTriage,
} from "@/features/pre-triage/pre-triage-storage";
import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

function useSessionStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  return values;
}

const ready: QuestionnaireProgress = {
  state: "READY_TO_COMPLETE",
  answeredRequiredFields: ["DURATION", "INTENSITY", "ADDITIONAL_SYMPTOMS"],
  missingRequiredFields: [],
  readyToComplete: true,
};

const result: NeutralPreTriageResult = {
  sessionId: "session-1",
  episodeId: "episode-1",
  primarySymptom: { code: "ABDOMINAL_PAIN", display: "Stomach pain" },
  duration: { value: 2, unit: "DAYS" },
  intensity: 6,
  additionalSymptoms: ["NAUSEA"],
  completedAt: "2026-08-22T12:05:00Z",
  questionnaire: { code: "abdominal-demo", version: "v1" },
  package: { code: "neutral-demo", version: "v1" },
  clinicalContent: { source: "PRODUCT_DEMO_DEFINED", reviewStatus: "NOT_APPLICABLE", clinicalApproval: "NOT_CLINICALLY_APPROVED" },
};

afterEach(() => vi.unstubAllGlobals());

describe("Phase 4 supported intake", () => {
  it("offers exactly the three supported pathways with exact backend codes", () => {
    expect(SUPPORTED_PATHWAYS.map(({ code, label }) => ({ code, label }))).toEqual([
      { code: "HEADACHE", label: "Headache" },
      { code: "ABDOMINAL_PAIN", label: "Stomach pain" },
      { code: "FEVER", label: "Fever" },
    ]);
  });

  it("uses all three additional symptoms for headache and stomach pain", () => {
    const backendValues = ["NAUSEA", "DIARRHEA", "FEVER"];
    expect(allowedAdditionalSymptoms("HEADACHE", backendValues)).toEqual(backendValues);
    expect(allowedAdditionalSymptoms("ABDOMINAL_PAIN", backendValues)).toEqual(backendValues);
  });

  it("excludes FEVER from a primary FEVER session and has no fourth option", () => {
    expect(allowedAdditionalSymptoms("FEVER", ["NAUSEA", "DIARRHEA", "FEVER", "DIZZINESS"])).toEqual(["NAUSEA", "DIARRHEA"]);
    expect(() => validateAnswerRequest({ structured: { additionalSymptoms: ["FEVER"] } }, "FEVER")).toThrow(BeeexyApiError);
  });

  it("uses the fixed duration question only before the first backend progression", () => {
    expect(questionForProgression()?.code).toBe("DURATION");
    expect(questionForProgression(ready)).toBeUndefined();
  });

  it("renders the exact next question supplied by backend progression", () => {
    const progression: QuestionnaireProgress = {
      state: "IN_PROGRESS",
      answeredRequiredFields: ["DURATION"],
      missingRequiredFields: ["INTENSITY", "ADDITIONAL_SYMPTOMS"],
      readyToComplete: false,
      nextQuestion: { code: "ADDITIONAL_SYMPTOMS", prompt: "Backend chose this question", answerType: "MULTIPLE_CHOICE", allowedValues: ["NAUSEA"], allowedUnits: [], minimum: null, maximum: null },
    };
    expect(questionForProgression(progression)).toBe(progression.nextQuestion);
    expect(questionForProgression(progression)?.prompt).toBe("Backend chose this question");
  });

  it("records only fields the backend confirms as accepted", () => {
    expect(mergeAcceptedAnswers({}, { duration: { value: 2, unit: "DAYS" }, intensity: 6 }, ["DURATION"])).toEqual({ duration: { value: 2, unit: "DAYS" } });
  });

  it("renders multiple natural-language values accepted by the backend", () => {
    const answers = mergeAcceptedAnswers({}, {
      duration: { value: 1, unit: "MONTHS" },
      intensity: 3,
      additionalSymptoms: ["NAUSEA"],
    }, ["DURATION", "INTENSITY", "ADDITIONAL_SYMPTOMS"]);
    const markup = renderToStaticMarkup(<PreTriageReviewSummary pathway="HEADACHE" answers={answers} />);

    expect(markup).toContain("1 month");
    expect(markup).toContain("3 / 10");
    expect(markup).toContain("Nausea");
    expect(markup).not.toContain("Captured from your description");
  });

  it("merges values accepted across multiple submissions without erasing earlier values", () => {
    const first = mergeAcceptedAnswers({}, { duration: { value: 2, unit: "DAYS" } }, ["DURATION"]);
    const second = mergeAcceptedAnswers(first, { additionalSymptoms: ["FEVER"] }, ["ADDITIONAL_SYMPTOMS"]);

    expect(second).toEqual({ duration: { value: 2, unit: "DAYS" }, additionalSymptoms: ["FEVER"] });
  });

  it("keeps structured input compatible when acceptedValues is absent", () => {
    expect(mergeAcceptedAnswers({}, null, ["INTENSITY"], { intensity: 7 })).toEqual({ intensity: 7 });
  });

  it("prefers authoritative backend values over the submitted structured value", () => {
    expect(mergeAcceptedAnswers({}, { intensity: 6 }, ["INTENSITY"], { intensity: 7 })).toEqual({ intensity: 6 });
  });

  it("does not fabricate values when neither acceptedValues nor structured input provides them", () => {
    const answers = mergeAcceptedAnswers({}, null, ["DURATION", "INTENSITY"]);
    const markup = renderToStaticMarkup(<PreTriageReviewSummary pathway="HEADACHE" answers={answers} />);

    expect(answers).toEqual({});
    expect(markup.match(/Captured from your description/g)).toHaveLength(3);
    expect(markup).not.toContain("0 / 10");
  });

  it.each([
    [{ value: 1, unit: "DAYS" as const }, "1 day"],
    [{ value: 2, unit: "DAYS" as const }, "2 days"],
    [{ value: 1, unit: "MONTHS" as const }, "1 month"],
    [{ value: 2, unit: "MONTHS" as const }, "2 months"],
    [{ value: 1, unit: "MINUTES" as const }, "1 minute"],
    [{ value: 2, unit: "HOURS" as const }, "2 hours"],
    [{ value: 1, unit: "WEEKS" as const }, "1 week"],
  ])("formats accepted duration %o as %s", (duration, expected) => {
    const markup = renderToStaticMarkup(<PreTriageReviewSummary pathway="HEADACHE" answers={{ duration }} />);
    expect(markup).toContain(expected);
  });

  it("supports multi-field natural-language progression without inferring missing controls locally", () => {
    const progression: QuestionnaireProgress = {
      state: "IN_PROGRESS",
      answeredRequiredFields: ["DURATION", "INTENSITY"],
      missingRequiredFields: ["ADDITIONAL_SYMPTOMS"],
      readyToComplete: false,
      nextQuestion: { code: "ADDITIONAL_SYMPTOMS", prompt: "Choose any additional symptoms", answerType: "MULTIPLE_CHOICE", allowedValues: ["NAUSEA", "DIARRHEA", "FEVER"], allowedUnits: [], minimum: null, maximum: null },
    };
    expect(questionForProgression(progression)?.code).toBe("ADDITIONAL_SYMPTOMS");
    expect(progression.missingRequiredFields).toEqual(["ADDITIONAL_SYMPTOMS"]);
  });

  it("falls back to calm structured intake copy when AI is unavailable or restricted", () => {
    expect(intakeOutcomeMessage("PROVIDER_UNAVAILABLE")).toMatch(/quick questions/i);
    expect(intakeOutcomeMessage("SAFETY_RESTRICTED")).not.toMatch(/provider|openai|gemini/i);
  });
});

describe("anonymous Pre-Triage state", () => {
  it("uses session-scoped storage and retains only the active guest credential handoff", () => {
    const values = useSessionStorage();
    writeAnonymousPreTriage({ sessionId: "session-1", pathway: "HEADACHE", questionnaireVersion: "v1", expiresAt: "2099-01-01T00:00:00Z", anonymousCapability: "secret", pendingClaim: true });

    expect(readAnonymousPreTriage()).toMatchObject({ sessionId: "session-1", anonymousCapability: "secret", pendingClaim: true });
    expect(values.has(ANONYMOUS_PRE_TRIAGE_STORAGE_KEY)).toBe(true);
    expect([...values.keys()]).not.toContain("beeexy:session");

    clearAnonymousPreTriage();
    expect(values.has(ANONYMOUS_PRE_TRIAGE_STORAGE_KEY)).toBe(false);
  });

  it("clears locally expired state and does not offer stale claim data", () => {
    const values = useSessionStorage();
    values.set(ANONYMOUS_PRE_TRIAGE_STORAGE_KEY, JSON.stringify({ sessionId: "session-1", pathway: "FEVER", questionnaireVersion: "v1", expiresAt: "2020-01-01T00:00:00Z", anonymousCapability: "secret", pendingClaim: true }));
    expect(readAnonymousPreTriage(Date.parse("2026-08-22T00:00:00Z"))).toBeNull();
    expect(values.has(ANONYMOUS_PRE_TRIAGE_STORAGE_KEY)).toBe(false);
  });

  it("converts a successful claim to authenticated state without retaining a pending claim", () => {
    const claimed = claimedPreTriageState({
      sessionId: "session-1",
      mode: "anonymous",
      pathway: "HEADACHE",
      questionnaireVersion: "v1",
      expiresAt: "2099-01-01T00:00:00Z",
      acceptedAnswers: {},
      pendingClaim: true,
    }, { sessionId: "session-1", episodeId: "episode-1", patientId: "primary-1", claimedAt: "2026-08-22T13:00:00Z" });

    expect(claimed).toMatchObject({ mode: "authenticated", patientId: "primary-1", pendingClaim: false });
    expect(claimed).not.toHaveProperty("anonymousCapability");
  });

  it("reconciles ambiguous claim failures before another claim mutation", () => {
    expect(shouldReconcileClaim(new BeeexyNetworkError())).toBe(true);
    expect(shouldReconcileClaim(new BeeexyApiError(500))).toBe(true);
    expect(shouldReconcileClaim(new BeeexyApiError(409))).toBe(false);
  });
});

describe("neutral result and privacy-safe errors", () => {
  it("renders only the canonical neutral result fields", () => {
    const markup = renderToStaticMarkup(<ResultSummary result={result} />).toLowerCase();
    expect(markup).toContain("stomach pain");
    expect(markup).toContain("2 days");
    expect(markup).toContain("6/10");
    for (const forbidden of ["urgency", "risk level", "diagnosis", "probability", "treatment", "prescription", "recommendation", "red flag"]) expect(markup).not.toContain(forbidden);
  });

  it("maps claim conflict and expiry without revealing another patient", () => {
    const conflict = preTriageErrorMessage(new BeeexyApiError(409), "claim");
    expect(conflict).toMatch(/can no longer be saved/i);
    expect(conflict).not.toMatch(/another patient|owner/i);
    expect(preTriageErrorMessage(new BeeexyApiError(404), "claim")).toMatch(/no longer available/i);
  });

  it("explains missing backend Phase 4 definitions instead of blaming the selected symptom", () => {
    const error = new BeeexyApiError(422, {
      problem: {
        status: 422,
        title: "Request validation failed.",
        errorCode: "pre_triage.definition_unavailable",
      },
    });

    expect(preTriageErrorMessage(error)).toMatch(/symptom setup could not be loaded/i);
    expect(preTriageErrorMessage(error)).not.toMatch(/check your answer/i);
  });
});
