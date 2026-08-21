import type { AccountSummary, AuthenticationResponse } from "./contracts";

export const SESSION_STORAGE_KEY = "beeexy:session";

export interface BeeexySession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  account: AccountSummary;
}

export interface SessionStore {
  clear(): void;
  read(): BeeexySession | null;
  write(session: BeeexySession): void;
  subscribe?(listener: (session: BeeexySession | null) => void): () => void;
}

export function sessionFromAuthentication(response: AuthenticationResponse): BeeexySession {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    accessTokenExpiresAt: response.accessTokenExpiresAt,
    refreshTokenExpiresAt: response.refreshTokenExpiresAt,
    account: response.account,
  };
}

export class BrowserSessionStore implements SessionStore {
  private readonly listeners = new Set<(session: BeeexySession | null) => void>();

  read() {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;

    try {
      const session = JSON.parse(stored) as unknown;
      if (!isBeeexySession(session)) throw new Error("Invalid session shape");
      return session;
    } catch {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
  }

  write(session: BeeexySession) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    this.emit(session);
  }

  clear() {
    if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_STORAGE_KEY);
    this.emit(null);
  }

  subscribe(listener: (session: BeeexySession | null) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(session: BeeexySession | null) {
    this.listeners.forEach((listener) => listener(session));
  }
}

function isBeeexySession(value: unknown): value is BeeexySession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<BeeexySession>;
  const account = session.account as Partial<AccountSummary> | undefined;
  return Boolean(
    typeof session.accessToken === "string" && session.accessToken &&
    typeof session.refreshToken === "string" && session.refreshToken &&
    typeof session.accessTokenExpiresAt === "string" &&
    typeof session.refreshTokenExpiresAt === "string" &&
    account && typeof account.accountId === "string" &&
    typeof account.profileId === "string" && typeof account.beeexyId === "string"
  );
}

export const beeexySessionStore = new BrowserSessionStore();
