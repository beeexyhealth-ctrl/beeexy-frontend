import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock("@/features/auth/auth-provider", () => ({
  AuthenticationBootstrapError: class AuthenticationBootstrapError extends Error {},
  useAuth: () => ({
    authenticateWithGoogle: vi.fn(),
    requestEmailChallenge: vi.fn(),
    resendEmailChallenge: vi.fn(),
    retryBootstrap: vi.fn(),
    verifyEmail: vi.fn(),
  }),
}));
vi.mock("@/features/pre-triage/pre-triage-provider", () => ({ usePreTriage: () => ({ pendingClaimRoute: null }) }));
vi.mock("@/features/auth/google-sign-in-button", () => ({ GoogleSignInButton: () => <button type="button">Continue with Google</button> }));

import { guestPreTriageRoute, LoginFlow } from "@/features/entry/login-flow";

describe("Phase 4 login guest entry", () => {
  it("renders guest, email, and Google entry actions together", () => {
    const markup = renderToStaticMarkup(<LoginFlow />);
    expect(markup).toContain("Continue as guest");
    expect(markup).toContain("Continue with email");
    expect(markup).toContain("Continue with Google");
  });

  it("routes guest entry directly to the anonymous Pre-Triage boundary", () => {
    expect(guestPreTriageRoute()).toBe("/pre-triage/new");
  });
});
