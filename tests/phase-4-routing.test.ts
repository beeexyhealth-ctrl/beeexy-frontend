import { describe, expect, it } from "vitest";
import { isGuestPreTriageRoute, isPublicRoute, postAuthDestination } from "@/features/auth/auth-route-boundary";

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

  it("continues a pending claim after authenticated bootstrap", () => {
    expect(postAuthDestination("/pre-triage/session-1/claim")).toBe("/pre-triage/session-1/claim");
    expect(postAuthDestination(null)).toBe("/home");
  });
});
