export interface EmailChallengeRequest {
  email: string;
}

export interface EmailVerificationRequest {
  email: string;
  code: string;
}

export interface GoogleAuthenticationRequest {
  credential: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AccountSummary {
  accountId: string;
  profileId: string;
  beeexyId: string;
}

export interface AuthenticationResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  account: AccountSummary;
}

export interface CurrentAccount {
  accountId: string;
  status: string;
  primaryProfile: {
    profileId: string;
    beeexyId: string;
  };
  preferences: Preferences;
}

export interface CurrentPatient {
  profileId: string;
  beeexyId: string;
  preferences: Preferences;
  version: number;
}

export interface Preferences {
  timezone: string;
}

export interface ProblemDetails {
  status?: number;
  title?: string;
  detail?: string;
  instance?: string;
  errorCode?: string;
  correlationId?: string;
}
