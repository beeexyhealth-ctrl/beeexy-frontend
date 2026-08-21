import { afterEach, describe, expect, it, vi } from "vitest";
import { BeeexyApiClient } from "@/lib/beeexy-api/api-client";
import { BeeexyAuthApi } from "@/lib/beeexy-api/auth-api";
import type { AuthenticationResponse } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import {
  BrowserSessionStore,
  SESSION_STORAGE_KEY,
  type BeeexySession,
  type SessionStore,
  sessionFromAuthentication,
} from "@/lib/beeexy-api/session-storage";
import { bootstrapCurrentSession, establishSession, logoutAndClearSession } from "@/features/auth/session-controller";
import { challengeErrorMessage, googleErrorMessage, verificationErrorMessage } from "@/features/auth/login-error-messages";

const baseUrl = "http://localhost:5105";
type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const authenticationResponse: AuthenticationResponse = {
  accessToken: "access-b",
  refreshToken: "refresh-b",
  accessTokenExpiresAt: "2099-08-20T23:15:00+00:00",
  refreshTokenExpiresAt: "2099-09-19T23:00:00+00:00",
  account: {
    accountId: "10000000-0000-4000-8000-000000000000",
    profileId: "20000000-0000-4000-8000-000000000000",
    beeexyId: "BXY-TEST",
  },
};

const expiredSession: BeeexySession = {
  ...sessionFromAuthentication(authenticationResponse),
  accessToken: "access-a",
  refreshToken: "refresh-a",
  accessTokenExpiresAt: "2020-01-01T00:00:00Z",
};

class MemorySessionStore implements SessionStore {
  constructor(private session: BeeexySession | null = null) {}
  clear() { this.session = null; }
  read() { return this.session; }
  write(session: BeeexySession) { this.session = session; }
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

afterEach(() => vi.unstubAllGlobals());

describe("Beeexy authentication API", () => {
  it("requests an email challenge with the documented body and accepts 202", async () => {
    const fetcher = vi.fn<TestFetch>(async () => new Response(null, { status: 202 }));
    const api = new BeeexyAuthApi(new BeeexyApiClient(baseUrl, new MemorySessionStore(), fetcher));

    await api.requestEmailChallenge({ email: "person@example.com" });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/auth/email/challenges`);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ email: "person@example.com" }));
  });

  it("verifies an OTP and returns the documented Beeexy session shape", async () => {
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse(authenticationResponse));
    const api = new BeeexyAuthApi(new BeeexyApiClient(baseUrl, new MemorySessionStore(), fetcher));

    const response = await api.verifyEmail({ email: "person@example.com", code: "123456" });

    expect(response).toEqual(authenticationResponse);
    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/auth/email/verify`);
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({ email: "person@example.com", code: "123456" }));
  });

  it("parses OTP Problem Details without exposing the backend detail as the error message", async () => {
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse({ status: 401, title: "Authentication failed.", detail: "internal detail", correlationId: "corr-1" }, 401));
    const api = new BeeexyAuthApi(new BeeexyApiClient(baseUrl, new MemorySessionStore(), fetcher));

    const error = await api.verifyEmail({ email: "person@example.com", code: "000000" }).catch((caught) => caught);

    expect(error).toBeInstanceOf(BeeexyApiError);
    expect(error.status).toBe(401);
    expect(error.correlationId).toBe("corr-1");
    expect(error.message).not.toContain("internal detail");
  });

  it("exchanges only the Google credential for a Beeexy session", async () => {
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse(authenticationResponse));
    const api = new BeeexyAuthApi(new BeeexyApiClient(baseUrl, new MemorySessionStore(), fetcher));

    await api.authenticateGoogle({ credential: "google-id-token" });

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/api/v1/auth/google`);
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({ credential: "google-id-token" }));
  });

  it("bootstraps the authoritative account and patient using one Bearer injection layer", async () => {
    const store = new MemorySessionStore(sessionFromAuthentication(authenticationResponse));
    const fetcher = vi.fn<TestFetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/api/v1/auth/me")) return jsonResponse({ accountId: authenticationResponse.account.accountId, status: "active", primaryProfile: { profileId: authenticationResponse.account.profileId, beeexyId: "BXY-TEST" }, preferences: { timezone: "Etc/UTC" } });
      return jsonResponse({ profileId: authenticationResponse.account.profileId, beeexyId: "BXY-TEST", preferences: { timezone: "Etc/UTC" }, version: 3 });
    });
    const api = new BeeexyAuthApi(new BeeexyApiClient(baseUrl, store, fetcher));

    const result = await bootstrapCurrentSession(api);

    expect(result.account.status).toBe("active");
    expect(result.patient.version).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls) expect((init?.headers as Headers).get("Authorization")).toBe("Bearer access-b");
  });

  it("persists a new token pair before bootstrapping a completed authentication", async () => {
    const store = new MemorySessionStore();
    const fetcher = vi.fn<TestFetch>(async (input) => String(input).endsWith("/auth/me")
      ? jsonResponse({ accountId: authenticationResponse.account.accountId, status: "active", primaryProfile: { profileId: authenticationResponse.account.profileId, beeexyId: "BXY-TEST" }, preferences: { timezone: "Etc/UTC" } })
      : jsonResponse({ profileId: authenticationResponse.account.profileId, beeexyId: "BXY-TEST", preferences: { timezone: "Etc/UTC" }, version: 1 }));
    const api = new BeeexyAuthApi(new BeeexyApiClient(baseUrl, store, fetcher));

    await establishSession(api, store, authenticationResponse);

    expect(store.read()?.refreshToken).toBe("refresh-b");
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get("Authorization")).toBe("Bearer access-b");
  });

  it("uses one refresh request for simultaneous expired-token requests and discards token A", async () => {
    const store = new MemorySessionStore(expiredSession);
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    let refreshCalls = 0;
    const fetcher = vi.fn<TestFetch>(async (input, init) => {
      if (String(input).endsWith("/api/v1/auth/refresh")) {
        refreshCalls += 1;
        expect(init?.body).toBe(JSON.stringify({ refreshToken: "refresh-a" }));
        await refreshGate;
        return jsonResponse(authenticationResponse);
      }
      return jsonResponse({ ok: true });
    });
    const client = new BeeexyApiClient(baseUrl, store, fetcher);

    const requests = ["/one", "/two", "/three"].map((path) => client.requestAuthenticated<{ ok: boolean }>(path));
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    releaseRefresh();
    await expect(Promise.all(requests)).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);

    expect(refreshCalls).toBe(1);
    expect(store.read()?.refreshToken).toBe("refresh-b");
  });

  it("refreshes after one authenticated 401 and retries the request exactly once", async () => {
    const store = new MemorySessionStore({ ...expiredSession, accessTokenExpiresAt: "2099-01-01T00:00:00Z" });
    const authorizations: Array<string | null> = [];
    let protectedCalls = 0;
    const fetcher = vi.fn<TestFetch>(async (input, init) => {
      if (String(input).endsWith("/api/v1/auth/refresh")) return jsonResponse(authenticationResponse);
      protectedCalls += 1;
      authorizations.push((init?.headers as Headers).get("Authorization"));
      return protectedCalls === 1 ? jsonResponse({ status: 401 }, 401) : jsonResponse({ ok: true });
    });
    const client = new BeeexyApiClient(baseUrl, store, fetcher);

    await expect(client.requestAuthenticated<{ ok: boolean }>("/protected")).resolves.toEqual({ ok: true });

    expect(protectedCalls).toBe(2);
    expect(authorizations).toEqual(["Bearer access-a", "Bearer access-b"]);
  });

  it("clears the session when refresh returns 401", async () => {
    const store = new MemorySessionStore(expiredSession);
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse({ status: 401, title: "Authentication failed." }, 401));
    const client = new BeeexyApiClient(baseUrl, store, fetcher);

    await expect(client.requestAuthenticated("/protected")).rejects.toMatchObject({ status: 401 });
    expect(store.read()).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("always clears local session state after logout, including an invalid backend session", async () => {
    const store = new MemorySessionStore({ ...expiredSession, accessTokenExpiresAt: "2099-01-01T00:00:00Z" });
    const fetcher = vi.fn<TestFetch>(async (input) => String(input).endsWith("/refresh")
      ? jsonResponse({ status: 401 }, 401)
      : jsonResponse({ status: 401 }, 401));
    const api = new BeeexyAuthApi(new BeeexyApiClient(baseUrl, store, fetcher));

    await expect(logoutAndClearSession(api, store)).rejects.toBeInstanceOf(BeeexyApiError);
    expect(store.read()).toBeNull();
  });
});

describe("Beeexy browser session persistence", () => {
  it("survives navigation storage and removes all token data on clear", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const store = new BrowserSessionStore();
    const session = sessionFromAuthentication(authenticationResponse);

    store.write(session);
    expect(new BrowserSessionStore().read()).toEqual(session);
    expect(values.has(SESSION_STORAGE_KEY)).toBe(true);

    store.clear();
    expect(values.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(store.read()).toBeNull();
  });
});

describe("Beeexy login error states", () => {
  it("maps documented OTP failures to safe, distinct UI states", () => {
    expect(verificationErrorMessage(new BeeexyApiError(401))).toMatch(/incorrect or has expired/i);
    expect(verificationErrorMessage(new BeeexyApiError(409))).toMatch(/already been used/i);
    expect(verificationErrorMessage(new BeeexyApiError(422))).toMatch(/valid six-digit code/i);
    expect(verificationErrorMessage(new BeeexyApiError(429))).toMatch(/too many verification attempts/i);
  });

  it("maps challenge throttling and Google provider failures without raw server details", () => {
    expect(challengeErrorMessage(new BeeexyApiError(429, { retryAfter: "60" }), true)).toContain("60");
    expect(googleErrorMessage(new BeeexyApiError(401))).toMatch(/could not be verified/i);
    expect(googleErrorMessage(new BeeexyApiError(503))).toMatch(/temporarily unavailable/i);
  });
});
