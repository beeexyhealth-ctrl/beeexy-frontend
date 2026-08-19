import { describe, expect, it } from "vitest";
import { preTriageAnswersSchema, bookingSchema, dependentSchema } from "@/lib/validation/schemas";
import { DEMO_ASSESSMENT_RESULT } from "@/features/pre-triage/demo-result";

describe("Beeexy domain validation", () => {
  it("accepts a complete pre-triage intake", () => {
    const parsed = preTriageAnswersSchema.parse({ symptom: "Headache", sexAtBirth: "female", ageRange: "30_49", watchedEducation: false, viewedTimeline: false, duration: "3–7 days", painLevel: 5, otherSymptoms: null });
    expect(parsed.painLevel).toBe(5);
  });

  it("rejects pain outside the supported intake range", () => {
    expect(() => preTriageAnswersSchema.parse({ symptom: "Headache", sexAtBirth: "female", ageRange: "30_49", watchedEducation: false, viewedTimeline: false, duration: "Today", painLevel: 11, otherSymptoms: null })).toThrow();
  });

  it("marks the migrated result as a demo fixture", () => {
    expect(DEMO_ASSESSMENT_RESULT.source).toBe("demo_fixture");
    expect(DEMO_ASSESSMENT_RESULT.disclaimer).toMatch(/Demo result only/);
  });

  it("validates booking and dependent identifiers", () => {
    expect(bookingSchema.safeParse({ doctorId: "11111111-1111-4111-8111-111111111111", slotId: "41000000-0000-4000-8000-000000000000", dependentId: null, reason: null }).success).toBe(true);
    expect(dependentSchema.safeParse({ firstName: "Sam", lastName: "Smith", relationship: "Child", birthDate: "2014-05-12", sexAtBirth: "prefer_not_to_say", state: "New York" }).success).toBe(true);
  });
});
