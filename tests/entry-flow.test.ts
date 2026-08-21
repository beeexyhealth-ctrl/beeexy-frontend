import { afterEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_STEPS } from "@/features/entry/onboarding-data";
import {
  completeOnboarding,
  hasCompletedOnboarding,
  ONBOARDING_STORAGE_KEY,
  resetOnboarding,
} from "@/features/entry/onboarding-storage";

function useMemoryStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Beeexy entry flow", () => {
  it("contains exactly three onboarding steps", () => {
    expect(ONBOARDING_STEPS).toHaveLength(3);
    expect(ONBOARDING_STEPS.map((step) => step.cta)).toEqual(["Continue", "Continue", "Get started"]);
  });

  it("persists and resets onboarding completion locally", () => {
    useMemoryStorage();

    expect(ONBOARDING_STORAGE_KEY).toBe("beeexy:onboarding-completed");
    expect(hasCompletedOnboarding()).toBe(false);

    completeOnboarding();
    expect(hasCompletedOnboarding()).toBe(true);

    resetOnboarding();
    expect(hasCompletedOnboarding()).toBe(false);
  });
});
