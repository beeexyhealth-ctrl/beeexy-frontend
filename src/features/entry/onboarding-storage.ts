export const ONBOARDING_STORAGE_KEY = "beeexy:onboarding-completed";

export function hasCompletedOnboarding() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
}

export function completeOnboarding() {
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
}

export function resetOnboarding() {
  window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}
