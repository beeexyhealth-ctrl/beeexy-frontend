export type DemoOption = {
  label: string;
  value: string;
};

export type DemoLocationOption = {
  label: string;
  value: {
    locality: string;
    administrativeArea: string;
    country: string;
  };
};

// Presentation labels for the approved Phase 7 synthetic dataset. Phase 7 has
// no taxonomy lookup API, so this catalog only translates established demo
// values for the UI; it is not a second domain model or matching configuration.
export const DEMO_SPECIALTIES: readonly DemoOption[] = [
  { label: "Primary Care", value: "demo-specialty-general" },
];

export const DEMO_LANGUAGES: readonly DemoOption[] = [
  { label: "English", value: "demo-language-en" },
  { label: "Spanish", value: "demo-language-es" },
];

export const DEMO_INSURANCE_PLANS: readonly DemoOption[] = [
  { label: "Amber Plan", value: "demo-plan-amber" },
  { label: "Blue Plan", value: "demo-plan-blue" },
];

export const DEMO_LOCATIONS: readonly DemoLocationOption[] = [
  {
    label: "Demo Central",
    value: {
      locality: "Demo Central",
      administrativeArea: "Synthetic Demo Region",
      country: "Synthetic Demo Country",
    },
  },
  {
    label: "Demo Harbor",
    value: {
      locality: "Demo Harbor",
      administrativeArea: "Synthetic Demo Region",
      country: "Synthetic Demo Country",
    },
  },
];

const optionLabels = new Map(
  [...DEMO_SPECIALTIES, ...DEMO_LANGUAGES, ...DEMO_INSURANCE_PLANS]
    .map((option) => [option.value, option.label]),
);

export function demoCatalogLabel(value: string, fallback?: string): string {
  return optionLabels.get(value) ?? fallback ?? value;
}

export function demoLocationLabel<T extends Partial<DemoLocationOption["value"]>>(
  location: T | null | undefined,
  fallback?: string,
): string {
  if (!location) return fallback ?? "Location not listed";

  const locationKeys: ReadonlyArray<keyof DemoLocationOption["value"]> = ["locality", "administrativeArea", "country"];
  const suppliedKeys = locationKeys.filter((key) => Boolean(location[key]));
  const matches = DEMO_LOCATIONS.filter((option) =>
    suppliedKeys.every((key) => option.value[key] === location[key]),
  );

  return matches.length === 1
    ? matches[0].label
    : location.locality ?? location.administrativeArea ?? location.country ?? fallback ?? "Location not listed";
}

export function demoLocationFromLabel(label: string): DemoLocationOption["value"] | undefined {
  return DEMO_LOCATIONS.find((option) => option.label === label)?.value;
}

export function selectedDemoLocationLabel(location: Partial<DemoLocationOption["value"]>): string {
  return DEMO_LOCATIONS.find((option) =>
    option.value.locality === location.locality
    && option.value.administrativeArea === location.administrativeArea
    && option.value.country === location.country,
  )?.label ?? "";
}
