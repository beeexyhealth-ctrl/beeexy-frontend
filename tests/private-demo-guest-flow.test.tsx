// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/features/auth/auth-provider";
import { DemoGuestBoundary } from "@/features/private-access/demo-guest-boundary";
import { PrivateAccessProvider, usePrivateAccess } from "@/features/private-access/private-access-provider";
import type { AuthenticationResponse, CurrentAccount, CurrentPatient } from "@/lib/beeexy-api/contracts";
import { beeexySessionStore, sessionFromAuthentication } from "@/lib/beeexy-api/session-storage";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { notifyPrivateAccessRequired } from "@/lib/beeexy-api/private-access-events";

const calls = vi.hoisted(() => [] as string[]);
const privateAccessApi = vi.hoisted(() => ({
  createDemoGuestSession: vi.fn(),
  getPrivateAccessSession: vi.fn(),
  loginPrivateAccess: vi.fn(),
  logoutPrivateAccess: vi.fn(),
}));
const authApi = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  getCurrentPatient: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/lib/beeexy-api/private-access-api", () => ({ beeexyPrivateAccessApi: privateAccessApi }));
vi.mock("@/lib/beeexy-api/auth-api", () => ({ beeexyAuthApi: authApi }));

const authentication: AuthenticationResponse = {
  accessToken: "guest-access-token",
  refreshToken: "guest-refresh-token",
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
  account: { accountId: "account-id", profileId: "profile-id", beeexyId: "BXY-GUEST" },
};

const account: CurrentAccount = {
  accountId: "account-id",
  status: "active",
  primaryProfile: { profileId: "profile-id", beeexyId: "BXY-GUEST" },
  preferences: { timezone: "America/Lima" },
};

const patient: CurrentPatient = {
  profileId: "profile-id",
  beeexyId: "BXY-GUEST",
  firstName: "Demo",
  lastName: "Guest",
  dateOfBirth: "1990-01-01",
  sexAssignedAtBirth: "Female",
  state: "Lima",
  profileVersion: 1,
  preferences: { timezone: "America/Lima" },
  version: 1,
};

function DemoTree({ children = <div>Beeexy application</div> }: { children?: React.ReactNode }) {
  return (
    <PrivateAccessProvider>
      <AuthProvider>
        <DemoGuestBoundary>{children}</DemoGuestBoundary>
      </AuthProvider>
    </PrivateAccessProvider>
  );
}

function ExitDemoProbe() {
  const { logout } = useAuth();
  const { exitDemo } = usePrivateAccess();
  return <button type="button" onClick={() => void exitDemo(logout)}>Exit demo</button>;
}

async function submitPrivateAccess() {
  fireEvent.change(await screen.findByLabelText("Username"), { target: { value: "demo-user" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "demo-password" } });
  fireEvent.change(screen.getByLabelText("Keyword"), { target: { value: "demo-keyword" } });
  fireEvent.click(screen.getByRole("button", { name: /enter beeexy/i }));
}

beforeEach(() => {
  calls.length = 0;
  beeexySessionStore.clear();
  for (const mock of Object.values(privateAccessApi)) mock.mockReset();
  for (const mock of Object.values(authApi)) mock.mockReset();
  privateAccessApi.getPrivateAccessSession.mockImplementation(async () => {
    calls.push("private-session");
    return { authenticated: true, expiresAt: null };
  });
  privateAccessApi.createDemoGuestSession.mockImplementation(async () => {
    calls.push("guest-session");
    return authentication;
  });
  privateAccessApi.loginPrivateAccess.mockImplementation(async () => {
    calls.push("private-login");
    return { kind: "legacy" };
  });
  privateAccessApi.logoutPrivateAccess.mockImplementation(async () => {
    calls.push("private-logout");
  });
  authApi.getCurrentAccount.mockImplementation(async () => {
    calls.push("auth-me");
    return account;
  });
  authApi.getCurrentPatient.mockImplementation(async () => {
    calls.push("patient-me");
    return patient;
  });
  authApi.logout.mockImplementation(async () => {
    calls.push("beeexy-logout");
  });
});

afterEach(() => {
  cleanup();
  beeexySessionStore.clear();
});

describe("Demo Guest bootstrap", () => {
  it("returns to Private Access instead of inferring Legacy mode from a cookie alone", async () => {
    render(<DemoTree />);

    expect(await screen.findByRole("heading", { name: "Enter the Beeexy private demo." })).toBeInTheDocument();
    expect(calls).toEqual(["private-session", "private-logout"]);
    expect(privateAccessApi.createDemoGuestSession).not.toHaveBeenCalled();
    expect(beeexySessionStore.read()).toBeNull();
  });

  it("exchanges private login for a Demo Guest session without opening normal Login", async () => {
    privateAccessApi.getPrivateAccessSession.mockImplementationOnce(async () => {
      calls.push("private-session");
      return { authenticated: false, expiresAt: null };
    });
    render(<DemoTree />);

    await submitPrivateAccess();

    expect(await screen.findByText("Beeexy application")).toBeInTheDocument();
    expect(calls).toEqual(["private-session", "private-login", "guest-session", "auth-me", "patient-me"]);
    expect(screen.queryByText(/continue with email/i)).not.toBeInTheDocument();
  });

  it("hydrates a Database login directly without calling guest-session", async () => {
    beeexySessionStore.write(sessionFromAuthentication({
      ...authentication,
      accessToken: "stale-access-token",
      refreshToken: "stale-refresh-token",
      account: { accountId: "stale-account", profileId: "stale-profile", beeexyId: "BXY-STALE" },
    }));
    const databaseAuthentication: AuthenticationResponse = {
      ...authentication,
      accessToken: "tester-access-token",
      refreshToken: "tester-refresh-token",
      account: { accountId: "tester-account", profileId: "tester-profile", beeexyId: "BXY-TESTER" },
    };
    privateAccessApi.getPrivateAccessSession.mockImplementationOnce(async () => {
      calls.push("private-session");
      return { authenticated: false, expiresAt: null };
    });
    privateAccessApi.loginPrivateAccess.mockImplementationOnce(async () => {
      calls.push("private-login");
      return { kind: "database", authentication: databaseAuthentication };
    });
    render(<DemoTree />);

    await submitPrivateAccess();

    expect(await screen.findByText("Beeexy application")).toBeInTheDocument();
    expect(calls).toEqual(["private-session", "private-login", "auth-me", "patient-me"]);
    expect(privateAccessApi.createDemoGuestSession).not.toHaveBeenCalled();
    expect(beeexySessionStore.read()).toEqual(sessionFromAuthentication(databaseAuthentication));
  });

  it("keeps a valid normal Beeexy session and skips guest issuance", async () => {
    beeexySessionStore.write(sessionFromAuthentication(authentication));
    render(<DemoTree />);

    expect(await screen.findByText("Beeexy application")).toBeInTheDocument();
    expect(privateAccessApi.createDemoGuestSession).not.toHaveBeenCalled();
    expect(calls).toEqual(["private-session", "auth-me", "patient-me"]);
  });

  it("shows a neutral non-looping state when Demo Guest is unavailable", async () => {
    privateAccessApi.getPrivateAccessSession.mockImplementationOnce(async () => {
      calls.push("private-session");
      return { authenticated: false, expiresAt: null };
    });
    privateAccessApi.createDemoGuestSession.mockRejectedValueOnce(new BeeexyApiError(503, {
      problem: { title: "Demo Guest unavailable." },
    }));
    render(<DemoTree />);

    await submitPrivateAccess();

    expect(await screen.findByRole("heading", { name: /demo is temporarily unavailable/i })).toBeInTheDocument();
    expect(privateAccessApi.createDemoGuestSession).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Beeexy application")).not.toBeInTheDocument();
  });

  it("clears normal authentication when the API reports a gate-specific 401", async () => {
    beeexySessionStore.write(sessionFromAuthentication(authentication));
    render(<DemoTree />);
    expect(await screen.findByText("Beeexy application")).toBeInTheDocument();

    act(() => notifyPrivateAccessRequired());

    expect(await screen.findByRole("heading", { name: "Enter the Beeexy private demo." })).toBeInTheDocument();
    expect(beeexySessionStore.read()).toBeNull();
    expect(privateAccessApi.createDemoGuestSession).not.toHaveBeenCalled();
  });
});

describe("Complete private-demo logout", () => {
  it("revokes Beeexy auth before clearing Private Access and returning to the gate", async () => {
    beeexySessionStore.write(sessionFromAuthentication(authentication));
    render(<DemoTree><ExitDemoProbe /></DemoTree>);
    fireEvent.click(await screen.findByRole("button", { name: "Exit demo" }));

    expect(await screen.findByRole("heading", { name: "Enter the Beeexy private demo." })).toBeInTheDocument();
    expect(calls.slice(-2)).toEqual(["beeexy-logout", "private-logout"]);
    expect(beeexySessionStore.read()).toBeNull();
    expect(privateAccessApi.createDemoGuestSession).not.toHaveBeenCalled();
  });
});
