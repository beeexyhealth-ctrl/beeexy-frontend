import { BeeexyApiClient } from "./api-client";
import { beeexyApiConfig } from "./config";
import type {
  AuthenticationResponse,
  CurrentAccount,
  CurrentPatient,
  EmailChallengeRequest,
  EmailVerificationRequest,
  GoogleAuthenticationRequest,
} from "./contracts";
import { beeexySessionStore } from "./session-storage";

export class BeeexyAuthApi {
  constructor(private readonly client: BeeexyApiClient) {}

  requestEmailChallenge(request: EmailChallengeRequest) {
    return this.client.requestPublic<void>("/api/v1/auth/email/challenges", { method: "POST", body: request, expectedStatus: 202 });
  }

  verifyEmail(request: EmailVerificationRequest) {
    return this.client.requestPublic<AuthenticationResponse>("/api/v1/auth/email/verify", { method: "POST", body: request, expectedStatus: 200 });
  }

  authenticateGoogle(request: GoogleAuthenticationRequest) {
    return this.client.requestPublic<AuthenticationResponse>("/api/v1/auth/google", { method: "POST", body: request, expectedStatus: 200 });
  }

  getCurrentAccount() {
    return this.client.requestAuthenticated<CurrentAccount>("/api/v1/auth/me", { expectedStatus: 200 });
  }

  getCurrentPatient() {
    return this.client.requestAuthenticated<CurrentPatient>("/api/v1/patients/me", { expectedStatus: 200 });
  }

  logout() {
    return this.client.requestAuthenticated<void>("/api/v1/auth/logout", { method: "POST", expectedStatus: 204 });
  }
}

export const beeexyApiClient = new BeeexyApiClient(beeexyApiConfig.baseUrl, beeexySessionStore);
export const beeexyAuthApi = new BeeexyAuthApi(beeexyApiClient);
