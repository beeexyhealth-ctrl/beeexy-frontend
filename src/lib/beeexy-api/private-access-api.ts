import { BeeexyApiClient } from "./api-client";
import { beeexyApiClient } from "./auth-api";

export interface PrivateAccessLoginRequest {
  username: string;
  password: string;
  keyword: string;
}

export interface PrivateAccessSessionStatus {
  authenticated: boolean;
  expiresAt: string | null;
}

export class BeeexyPrivateAccessApi {
  constructor(private readonly client: BeeexyApiClient) {}

  loginPrivateAccess(request: PrivateAccessLoginRequest) {
    return this.client.requestPublic<void>("/api/v1/private-access/login", {
      method: "POST",
      body: request,
      expectedStatus: 204,
    });
  }

  getPrivateAccessSession() {
    return this.client.requestPublic<PrivateAccessSessionStatus>("/api/v1/private-access/session", {
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
