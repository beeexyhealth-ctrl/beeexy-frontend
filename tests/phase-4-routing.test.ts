import { describe, expect, it } from "vitest";
import { isGuestPreTriageRoute, isPublicDirectoryRoute, isPublicRoute, postAuthDestination } from "@/features/auth/auth-route-boundary";

describe("Phase 4 guest route boundary", () => {
  it("allows only guest Pre-Triage pages and keeps the claim route authenticated", () => {
    expect(isGuestPreTriageRoute("/pre-triage/new")).toBe(true);
    expect(isGuestPreTriageRoute("/pre-triage/session-1")).toBe(true);
    expect(isGuestPreTriageRoute("/pre-triage/session-1/review")).toBe(true);
    expect(isGuestPreTriageRoute("/pre-triage/session-1/result")).toBe(true);
    expect(isGuestPreTriageRoute("/pre-triage/session-1/claim")).toBe(false);
  });

  it("does not unlock authenticated application routes for guests", () => {
    for (const route of ["/home", "/settings", "/my-health", "/my-health/circle", "/appointments"]) expect(isPublicRoute(route)).toBe(false);
    expect(isPublicRoute("/pre-triage/new")).toBe(true);
  });

  it("keeps Phase 7 directory list and detail routes public without exposing booking", () => {
    for (const route of ["/doctors", "/doctors/doctor-id", "/clinics", "/clinics/clinic-id"]) {
      expect(isPublicDirectoryRoute(route)).toBe(true);
      expect(isPublicRoute(route)).toBe(true);
    }
    expect(isPublicDirectoryRoute("/doctors/doctor-id/book")).toBe(false);
  });

  it("continues a pending claim after authenticated bootstrap", () => {
    expect(postAuthDestination("/pre-triage/session-1/claim")).toBe("/pre-triage/session-1/claim");
    expect(postAuthDestination(null)).toBe("/home");
  });
});
