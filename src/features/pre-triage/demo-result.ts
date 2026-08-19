import type { AssessmentResult } from "@/types/domain";

/**
 * Visual fixture copied from the approved prototype for demonstration only.
 * It is never selected by clinical inference and must not be treated as medical advice.
 */
export const DEMO_ASSESSMENT_RESULT: AssessmentResult = {
  source: "demo_fixture",
  fixtureVersion: "prototype-headache-v1",
  urgencyLabel: "Demo: medium urgency",
  possibleConditions: [
    {
      label: "Tension headache",
      displayPercentage: 72,
      description: "Prototype display content; not a diagnosis."
    },
    {
      label: "Migraine",
      displayPercentage: 18,
      description: "Prototype display content; not a diagnosis."
    },
    {
      label: "Dehydration-related headache",
      displayPercentage: 10,
      description: "Prototype display content; not a diagnosis."
    }
  ],
  disclaimer:
    "Demo result only. Beeexy has not performed a medical assessment. This does not replace a licensed clinician."
};
