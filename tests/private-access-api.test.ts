import { describe, expect, it, vi } from "vitest";
import { BeeexyApiClient } from "@/lib/beeexy-api/api-client";
import { BeeexyPrivateAccessApi } from "@/lib/beeexy-api/private-access-api";
import { subscribeToPrivateAccessRequired } from "@/lib/beeexy-api/private-access-events";
import type { BeeexySession, SessionStore } from "@/lib/beeexy-api/session-storage";
import type { AuthenticationResponse } from "@/lib/beeexy-api/contracts";

const baseUrl = "http://localhost:5105";
type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

class MemorySessionStore implements SessionStore {
  constructor(private session: BeeexySession | null = null) {}
  clear() { this.session = null; }
  read() { return this.session; }
  write(session: BeeexySession) { this.session = session; }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/problem+json" } });
}

describe("Beeexy Private Access API", () => {
  it("uses the exact login, session, and logout contracts with browser credentials", async () => {
    const fetcher = vi.fn<TestFetch>(async (input) => {
      if (String(input).endsWith("/session")) {
        return new Response(JSON.stringify({ authenticated: true, expiresAt: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    });
    const api = new BeeexyPrivateAccessApi(new BeeexyApiClient(baseUrl, new MemorySessionStore(), fetcher));
    const credentials = { username: " demo-user ", password: "pass word", keyword: "KeyWord" };

    await expect(api.loginPrivateAccess(credentials)).resolves.toEqual({ kind: "legacy" });
    await expect(api.getPrivateAccessSession()).resolves.toEqual({ authenticated: true, expiresAt: null });
    await api.logoutPrivateAccess();

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      `${baseUrl}/api/v1/private-access/login`,
      `${baseUrl}/api/v1/private-access/session`,
      `${baseUrl}/api/v1/private-access/logout`,
    ]);
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify(credentials));
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get("Accept")).toBe("application/json, application/problem+json");
    expect(fetcher.mock.calls[1][1]?.method).toBe("GET");
    expect(fetcher.mock.calls[2][1]?.method).toBe("POST");
    for (const [, init] of fetcher.mock.calls) expect(init?.credentials).toBe("include");
  });

  it("parses a Database login from status 200 and preserves its Account identity", async () => {
    const authentication: AuthenticationResponse = {
      accessToken: "tester-access-token",
      refreshToken: "tester-refresh-token",
      accessTokenExpiresAt: "2099-01-01T00:00:00Z",
      refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
      account: { accountId: "tester-account", profileId: "tester-profile", beeexyId: "BXY-TESTER" },
    };
    const fetcher = vi.fn<TestFetch>(async () => new Response(JSON.stringify(authentication), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const api = new BeeexyPrivateAccessApi(new BeeexyApiClient(baseUrl, new MemorySessionStore(), fetcher));

    await expect(api.loginPrivateAccess({ username: "tester", password: "password", keyword: "keyword" }))
      .resolves.toEqual({ kind: "database", authentication });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]?.credentials).toBe("include");
  });

  it("rejects malformed or unexpected successful login responses", async () => {
    const malformedFetcher = vi.fn<TestFetch>(async () => jsonResponse({ accessToken: "incomplete" }, 200));
    const malformedApi = new BeeexyPrivateAccessApi(new BeeexyApiClient(baseUrl, new MemorySessionStore(), malformedFetcher));

    await expect(malformedApi.loginPrivateAccess({ username: "tester", password: "password", keyword: "keyword" }))
      .rejects.toMatchObject({ status: 502 });

    const unexpectedFetcher = vi.fn<TestFetch>(async () => jsonResponse({ ok: true }, 201));
    const unexpectedApi = new BeeexyPrivateAccessApi(new BeeexyApiClient(baseUrl, new MemorySessionStore(), unexpectedFetcher));

    await expect(unexpectedApi.loginPrivateAccess({ username: "tester", password: "password", keyword: "keyword" }))
      .rejects.toMatchObject({ status: 201 });
  });

  it("creates a Demo Guest session with a bodyless credentialed request", async () => {
    const authentication: AuthenticationResponse = {
      accessToken: "guest-access-token",
      refreshToken: "guest-refresh-token",
      accessTokenExpiresAt: "2099-01-01T00:00:00Z",
      refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
      account: { accountId: "account", profileId: "profile", beeexyId: "BXY-GUEST" },
    };
    const fetcher = vi.fn<TestFetch>(async () => new Response(JSON.stringify(authentication), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const api = new BeeexyPrivateAccessApi(new BeeexyApiClient(baseUrl, new MemorySessionStore(), fetcher));

    await expect(api.createDemoGuestSession()).resolves.toEqual(authentication);

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/api/v1/private-access/guest-session`);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
    expect(init?.credentials).toBe("include");
    expect((init?.headers as Headers).get("Content-Type")).toBeNull();
    expect((init?.headers as Headers).get("Accept")).toBe("application/json, application/problem+json");
  });

  it("sends the private cookie on public and authenticated product requests", async () => {
    const session: BeeexySession = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: "2099-01-01T00:00:00Z",
      refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
      account: { accountId: "account", profileId: "profile", beeexyId: "BXY-TEST" },
    };
    const fetcher = vi.fn<TestFetch>(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const client = new BeeexyApiClient(baseUrl, new MemorySessionStore(session), fetcher);

    await client.requestPublic("/api/v1/pre-triage/sessions");
    await client.requestAuthenticated("/api/v1/patients/profile/clinical-history");
    await client.requestAuthenticated("/api/v1/fhir-exports/export-id");

    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, init] of fetcher.mock.calls) expect(init?.credentials).toBe("include");
  });

  it("signals only the documented gate-specific 401 and does not attempt token refresh", async () => {
    const session: BeeexySession = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: "2099-01-01T00:00:00Z",
      refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
      account: { accountId: "account", profileId: "profile", beeexyId: "BXY-TEST" },
    };
    const fetcher = vi.fn<TestFetch>(async () => jsonResponse({
      title: "Private access required.",
      status: 401,
      detail: "A valid private demo access session is required.",
    }, 401));
    const listener = vi.fn();
    const unsubscribe = subscribeToPrivateAccessRequired(listener);
    const store = new MemorySessionStore(session);
    const client = new BeeexyApiClient(baseUrl, store, fetcher);

    await expect(client.requestAuthenticated("/api/v1/patients")).rejects.toMatchObject({
      status: 401,
      problem: { title: "Private access required." },
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(store.read()).toEqual(session);
    unsubscribe();
  });
});
