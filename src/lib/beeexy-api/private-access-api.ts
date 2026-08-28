import { BeeexyApiClient } from "./api-client";
import { beeexyApiClient } from "./auth-api";
import type { AuthenticationResponse } from "./contracts";
import { BeeexyApiError } from "./problem-details";

export interface PrivateAccessLoginRequest {
  username: string;
  password: string;
  keyword: string;
}

export interface PrivateAccessSessionStatus {
  authenticated: boolean;
  expiresAt: string | null;
}

export type PrivateAccessLoginOutcome =
  | { kind: "legacy" }
  | { kind: "database"; authentication: AuthenticationResponse };

export class BeeexyPrivateAccessApi {
  constructor(private readonly client: BeeexyApiClient) {}

  async loginPrivateAccess(request: PrivateAccessLoginRequest): Promise<PrivateAccessLoginOutcome> {
    const response = await this.client.requestPublicResponse<unknown>("/api/v1/private-access/login", {
      method: "POST",
      body: request,
      headers: { Accept: "application/json, application/problem+json" },
      expectedStatus: [200, 204],
    });

    if (response.status === 204) return { kind: "legacy" };
    if (response.status === 200 && isAuthenticationResponse(response.data)) {
      return { kind: "database", authentication: response.data };
    }

    throw new BeeexyApiError(502);
  }

  getPrivateAccessSession() {
    return this.client.requestPublic<PrivateAccessSessionStatus>("/api/v1/private-access/session", {
      expectedStatus: 200,
    });
  }

  createDemoGuestSession() {
    return this.client.requestPublic<AuthenticationResponse>("/api/v1/private-access/guest-session", {
      method: "POST",
      headers: { Accept: "application/json, application/problem+json" },
      expectedStatus: 200,
    });
  }

  logoutPrivateAccess() {
    return this.client.requestPublic<void>("/api/v1/private-access/logout", {
      method: "POST",
      expectedStatus: 204,
    });
  }
}

export const beeexyPrivateAccessApi = new BeeexyPrivateAccessApi(beeexyApiClient);

function isAuthenticationResponse(value: unknown): value is AuthenticationResponse {
  if (!isRecord(value) || !isRecord(value.account)) return false;
  return isNonEmptyString(value.accessToken)
    && isNonEmptyString(value.refreshToken)
    && isNonEmptyString(value.accessTokenExpiresAt)
    && isNonEmptyString(value.refreshTokenExpiresAt)
    && isNonEmptyString(value.account.accountId)
    && isNonEmptyString(value.account.profileId)
    && isNonEmptyString(value.account.beeexyId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
