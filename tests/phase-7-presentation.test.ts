import { describe, expect, it } from "vitest";
import {
  DEMO_INSURANCE_PLANS,
  DEMO_LANGUAGES,
  DEMO_LOCATIONS,
  DEMO_SPECIALTIES,
  demoCatalogLabel,
  demoLocationFromLabel,
  demoLocationLabel,
  selectedDemoLocationLabel,
} from "@/features/directories/demo-presentation-catalog";

describe("Phase 7 demo presentation catalog", () => {
  it("maps each approved code to a patient-facing label", () => {
    expect(DEMO_SPECIALTIES).toContainEqual({ label: "Primary Care", value: "demo-specialty-general" });
    expect(DEMO_LANGUAGES).toContainEqual({ label: "Spanish", value: "demo-language-es" });
    expect(DEMO_INSURANCE_PLANS).toContainEqual({ label: "Blue Plan", value: "demo-plan-blue" });
    expect(demoCatalogLabel("demo-specialty-general")).toBe("Primary Care");
    expect(demoCatalogLabel("demo-language-en")).toBe("English");
    expect(demoCatalogLabel("demo-plan-amber")).toBe("Amber Plan");
  });

  it("maps a friendly location selection to its complete exact API tuple", () => {
    const harbor = demoLocationFromLabel("Demo Harbor");
    expect(harbor).toEqual({
      locality: "Demo Harbor",
      administrativeArea: "Synthetic Demo Region",
      country: "Synthetic Demo Country",
    });
    expect(selectedDemoLocationLabel(harbor ?? {})).toBe("Demo Harbor");
    expect(demoLocationLabel(harbor)).toBe("Demo Harbor");
    expect(demoLocationLabel({
      locationId: "location-1",
      name: "Synthetic Mosaic Harbor Location",
      locality: "Demo Harbor",
      administrativeArea: "Synthetic Demo Region",
      country: "Synthetic Demo Country",
      timeZone: "America/Lima",
    })).toBe("Demo Harbor");
    expect(DEMO_LOCATIONS).toHaveLength(2);
  });

  it("uses a returned DTO name as the safe fallback for an unmapped catalog value", () => {
    expect(demoCatalogLabel("future-approved-code", "Future display name")).toBe("Future display name");
  });
});
