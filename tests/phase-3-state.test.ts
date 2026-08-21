import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessiblePatient, CurrentPatient } from "@/lib/beeexy-api/contracts";
import { RELATIONSHIP_OPTIONS, US_STATES } from "@/features/my-circle/constants";
import { validateDemographics } from "@/features/my-circle/forms";
import {
  completeCareChoice,
  hasCompletedCareChoice,
  readActivePatientId,
  writeActivePatientId,
} from "@/features/my-circle/patient-storage";
import { buildPatientPatch, isPrimaryProfileComplete, primaryCompletionPatch, resolveActivePatient } from "@/features/my-circle/patient-state";

const primary: AccessiblePatient = { profileId: "primary", beeexyId: "BXY-P", firstName: "Jesús", lastName: "Arias", accessType: "Primary", relationship: null };
const managed: AccessiblePatient = { profileId: "managed", beeexyId: "BXY-M", firstName: "María", lastName: "Arias", accessType: "Managed", relationship: { relationshipId: "relationship", type: "Child" } };

const currentPatient: CurrentPatient = {
  profileId: "primary",
  beeexyId: "BXY-P",
  firstName: "Jesús",
  lastName: "Arias",
  dateOfBirth: "1990-04-18",
  sexAssignedAtBirth: "Male",
  state: "FL",
  profileVersion: 7,
  preferences: { timezone: "America/New_York" },
  version: 41,
};

afterEach(() => vi.unstubAllGlobals());

describe("Phase 3 bootstrap and active patient state", () => {
  it("routes incomplete primary profiles from the five approved nullable demographics", () => {
    expect(isPrimaryProfileComplete({ ...currentPatient, firstName: null })).toBe(false);
    expect(isPrimaryProfileComplete(currentPatient)).toBe(true);
  });

  it("restores a valid managed active patient", () => {
    expect(resolveActivePatient([primary, managed], "managed")).toEqual(managed);
  });

  it("falls back to the primary patient when the stored selection is stale or revoked", () => {
    expect(resolveActivePatient([primary], "managed")).toEqual(primary);
  });

  it("never selects an inaccessible patient", () => {
    expect(resolveActivePatient([], "managed")).toBeNull();
    expect(resolveActivePatient([primary], "unknown")?.profileId).toBe("primary");
  });

  it("uses profileVersion for demographic completion and preserves preference version separation", () => {
    const patch = primaryCompletionPatch(currentPatient, {
      firstName: "Jesús", lastName: "Arias", dateOfBirth: "1990-04-18", sexAssignedAtBirth: "Male", state: "FL",
    });
    expect(patch.version).toBe(7);
    expect(patch.version).not.toBe(currentPatient.version);
  });

  it("builds a true partial update with the latest detail version", () => {
    const patch = buildPatientPatch({
      profileId: "primary", beeexyId: "BXY-P", firstName: "Jesús", lastName: "Arias", dateOfBirth: "1990-04-18", sexAssignedAtBirth: "Male", state: "FL", version: 9,
    }, { firstName: " Jesús ", lastName: "Arias", dateOfBirth: "1990-04-18", sexAssignedAtBirth: "Male", state: "NY" });
    expect(patch).toEqual({ version: 9, state: "NY" });
  });

  it("persists only active profile identity and the initial care-choice flag", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });

    writeActivePatientId("primary", "managed");
    completeCareChoice("primary");

    expect(readActivePatientId("primary")).toBe("managed");
    expect(hasCompletedCareChoice("primary")).toBe(true);
    expect([...values.values()]).toEqual(["managed", "true"]);
  });
});

describe("Phase 3 form contracts", () => {
  it("contains exactly the 50 documented states and seven relationship values", () => {
    expect(US_STATES).toHaveLength(50);
    expect(RELATIONSHIP_OPTIONS.map((option) => option.value)).toEqual(["Parent", "LegalGuardian", "Caregiver", "Spouse", "Child", "Sibling", "Other"]);
  });

  it("accepts trimmed Unicode names and returns the exact transport shape", () => {
    const result = validateDemographics({ firstName: "  María  ", lastName: " Núñez ", dateOfBirth: "2012-05-12", sexAssignedAtBirth: "Female", state: "NY" }, "2026-08-21");
    expect(result.value).toEqual({ firstName: "María", lastName: "Núñez", dateOfBirth: "2012-05-12", sexAssignedAtBirth: "Female", state: "NY" });
  });

  it("rejects future or impossible dates and arbitrary state text", () => {
    expect(validateDemographics({ firstName: "A", lastName: "B", dateOfBirth: "2027-01-01", sexAssignedAtBirth: "Male", state: "New York" }, "2026-08-21").errors).toMatchObject({ dateOfBirth: expect.any(String), state: expect.any(String) });
    expect(validateDemographics({ firstName: "A", lastName: "B", dateOfBirth: "2020-02-31", sexAssignedAtBirth: "Male", state: "NY" }, "2026-08-21").errors.dateOfBirth).toBeDefined();
  });
});
