import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export function preTriageErrorMessage(error: unknown, context: "flow" | "claim" = "flow") {
  if (error instanceof BeeexyNetworkError) return "Beeexy could not connect. Check your connection and try again.";
  if (!(error instanceof BeeexyApiError)) return "Beeexy could not complete this request. Please try again.";

  if (context === "claim") {
    if (error.status === 409) return "This Pre-Triage can no longer be saved to this profile.";
    if (error.status === 404) return "This Pre-Triage is no longer available. Start a new one when you are ready.";
    if (error.status === 401) return "Please sign in again to save this Pre-Triage.";
  }

  if (error.status === 401 || error.status === 404) return "This Pre-Triage is no longer available. You can start a new one.";
  if (error.status === 409) return "This Pre-Triage has changed and cannot accept that answer. Please continue from the latest available step.";
  if (error.status === 422) {
    switch (error.problem?.errorCode) {
      case "pre_triage.pathway_required":
      case "pre_triage.pathway_unknown":
      case "pre_triage.pathway_unsupported": return "That symptom is not available for Pre-Triage right now.";
      case "pre_triage.definition_unavailable": return "Pre-Triage is not available right now because its symptom setup could not be loaded. Please try again later.";
      case "pre_triage.duration_invalid": return "Enter a duration greater than zero and choose a valid unit.";
      case "pre_triage.intensity_invalid": return "Choose a whole number from 1 to 10.";
      case "pre_triage.additional_symptoms_invalid": return "Choose only the additional symptoms shown for this Pre-Triage.";
      case "pre_triage.natural_language_invalid": return "Describe what you are feeling in 4,000 characters or fewer.";
      case "pre_triage.completion_incomplete": return "A few answers are still needed before you can complete Pre-Triage.";
      default: return "Check your answer and try again.";
    }
  }
  return "Beeexy could not complete this request. Please try again.";
}

export function intakeOutcomeMessage(outcome: string) {
  if (outcome === "PROVIDER_UNAVAILABLE") return "Let’s continue with a few quick questions.";
  if (outcome === "SAFETY_RESTRICTED") return "I can help organize the supported symptom details below, but I can’t provide medical advice here.";
  if (outcome === "UNSUPPORTED") return "That request is outside this Pre-Triage. Continue with the supported questions below.";
  if (outcome === "CLARIFICATION_REQUIRED") return "I need a little more detail. Continue with the quick questions below.";
  return "Your description was accepted. Continue with any remaining questions.";
}
