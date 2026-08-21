import type { AuthenticationResponse } from "./contracts";
import { createApiError, BeeexyApiError, BeeexyNetworkError } from "./problem-details";
import type { BeeexySession, SessionStore } from "./session-storage";
import { sessionFromAuthentication } from "./session-storage";

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type RequestOptions = {
  body?: unknown;
  expectedStatus?: number;
  method?: "GET" | "POST" | "PATCH";
};

const ACCESS_TOKEN_SKEW_MS = 30_000;

export class BeeexyApiClient {
  private refreshInFlight: Promise<BeeexySession> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly sessionStore: SessionStore,
    private readonly fetchImplementation: FetchImplementation = (input, init) => fetch(input, init),
  ) {}

  requestPublic<T>(path: string, options: RequestOptions = {}) {
    return this.send<T>(path, options);
  }

  async requestAuthenticated<T>(path: string, options: RequestOptions = {}) {
    let session = this.requireSession();

    if (accessTokenNeedsRefresh(session)) {
      session = await this.refreshSession();
    }

    let response = await this.fetchResponse(path, options, session.accessToken);
    if (response.status === 401) {
      session = await this.refreshSession();
      response = await this.fetchResponse(path, options, session.accessToken);
      if (response.status === 401) this.sessionStore.clear();
    }

    return this.readResponse<T>(response, options.expectedStatus);
  }

  refreshSession() {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async performRefresh() {
    const session = this.requireSession();

    try {
      const response = await this.send<AuthenticationResponse>("/api/v1/auth/refresh", {
        method: "POST",
        body: { refreshToken: session.refreshToken },
        expectedStatus: 200,
      });
      const nextSession = sessionFromAuthentication(response);
      this.sessionStore.write(nextSession);
      return nextSession;
    } catch (error) {
      if (error instanceof BeeexyApiError && error.status === 401) this.sessionStore.clear();
      throw error;
    }
  }

  private requireSession() {
    const session = this.sessionStore.read();
    if (!session) throw new BeeexyApiError(401);
    return session;
  }

  private async send<T>(path: string, options: RequestOptions) {
    const response = await this.fetchResponse(path, options);
    return this.readResponse<T>(response, options.expectedStatus);
  }

  private async fetchResponse(path: string, options: RequestOptions, accessToken?: string) {
    const headers = new Headers({ Accept: "application/json" });
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    try {
      return await this.fetchImplementation(`${this.baseUrl}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new BeeexyNetworkError();
    }
  }

  private async readResponse<T>(response: Response, expectedStatus?: number) {
    if (!response.ok || (expectedStatus !== undefined && response.status !== expectedStatus)) {
      throw await createApiError(response);
    }
    if (response.status === 202 || response.status === 204) return undefined as T;
    return await response.json() as T;
  }
}

export function accessTokenNeedsRefresh(session: BeeexySession, now = Date.now()) {
  const expiresAt = Date.parse(session.accessTokenExpiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= now + ACCESS_TOKEN_SKEW_MS;
}
