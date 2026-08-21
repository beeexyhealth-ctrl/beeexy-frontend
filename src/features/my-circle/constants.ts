import type { RelationshipType, SexAssignedAtBirth } from "@/lib/beeexy-api/contracts";

export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"],
  ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;

export const STATE_NAMES = Object.fromEntries(US_STATES) as Record<string, string>;

export const RELATIONSHIP_OPTIONS: ReadonlyArray<{ label: string; value: RelationshipType }> = [
  { label: "Parent", value: "Parent" },
  { label: "Legal guardian", value: "LegalGuardian" },
  { label: "Caregiver", value: "Caregiver" },
  { label: "Spouse", value: "Spouse" },
  { label: "Child", value: "Child" },
  { label: "Sibling", value: "Sibling" },
  { label: "Other", value: "Other" },
];

export const RELATIONSHIP_LABELS = Object.fromEntries(
  RELATIONSHIP_OPTIONS.map(({ label, value }) => [value, label]),
) as Record<RelationshipType, string>;

export const SEX_OPTIONS: ReadonlyArray<{ label: string; value: SexAssignedAtBirth }> = [
  { label: "Male", value: "Male" },
  { label: "Female", value: "Female" },
];

export const CARE_ATTESTATION = {
  copy: process.env.NEXT_PUBLIC_CARE_ATTESTATION_COPY?.trim() || null,
  version: process.env.NEXT_PUBLIC_CARE_ATTESTATION_VERSION?.trim() || null,
};
