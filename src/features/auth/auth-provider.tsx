"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { beeexyAuthApi } from "@/lib/beeexy-api/auth-api";
import type { AuthenticationResponse, CurrentAccount, CurrentPatient } from "@/lib/beeexy-api/contracts";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import {
  beeexySessionStore,
  type BeeexySession,
} from "@/lib/beeexy-api/session-storage";
import { bootstrapCurrentSession, establishSession, logoutAndClearSession } from "./session-controller";

export type AuthStatus = "bootstrapping" | "unauthenticated" | "authenticating" | "authenticated" | "error" | "signing-out";

type AuthContextValue = {
  account: CurrentAccount | null;
  patient: CurrentPatient | null;
  session: BeeexySession | null;
  status: AuthStatus;
  authenticateWithGoogle(credential: string): Promise<void>;
  logout(): Promise<void>;
  requestEmailChallenge(email: string): Promise<void>;
  resendEmailChallenge(email: string): Promise<void>;
  retryBootstrap(): Promise<void>;
  verifyEmail(email: string, code: string): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export class AuthenticationBootstrapError extends Error {
  constructor() {
    super("The Beeexy session was created, but account setup could not finish.");
    this.name = "AuthenticationBootstrapError";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("bootstrapping");
  const [session, setSession] = useState<BeeexySession | null>(null);
  const [account, setAccount] = useState<CurrentAccount | null>(null);
  const [patient, setPatient] = useState<CurrentPatient | null>(null);

  const clearState = useCallback(() => {
    beeexySessionStore.clear();
    setSession(null);
    setAccount(null);
    setPatient(null);
    setStatus("unauthenticated");
  }, []);

  const loadAuthoritativeState = useCallback(async () => {
    try {
      const { account: currentAccount, patient: currentPatient } = await bootstrapCurrentSession(beeexyAuthApi);
      setSession(beeexySessionStore.read());
      setAccount(currentAccount);
      setPatient(currentPatient);
      setStatus("authenticated");
    } catch (error) {
      if (error instanceof BeeexyApiError && error.status === 401) {
        clearState();
      } else {
        setStatus("error");
      }
      throw error;
    }
  }, [clearState]);

  const retryBootstrap = useCallback(async () => {
    if (!beeexySessionStore.read()) {
      clearState();
      return;
    }
    setStatus("bootstrapping");
    await loadAuthoritativeState();
  }, [clearState, loadAuthoritativeState]);

  useEffect(() => {
    const unsubscribe = beeexySessionStore.subscribe((nextSession) => setSession(nextSession));
    const storedSession = beeexySessionStore.read();
    if (!storedSession) {
      const frame = requestAnimationFrame(() => setStatus("unauthenticated"));
      return () => {
        cancelAnimationFrame(frame);
        unsubscribe();
      };
    }

    const frame = requestAnimationFrame(() => {
      setSession(storedSession);
      void loadAuthoritativeState().catch(() => undefined);
    });
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [loadAuthoritativeState]);

  const finishAuthentication = useCallback(async (response: AuthenticationResponse) => {
    try {
      const { account: currentAccount, patient: currentPatient } = await establishSession(beeexyAuthApi, beeexySessionStore, response);
      setSession(beeexySessionStore.read());
      setAccount(currentAccount);
      setPatient(currentPatient);
      setStatus("authenticated");
    } catch (error) {
      if (error instanceof BeeexyApiError && error.status === 401) clearState();
      else if (beeexySessionStore.read()) {
        setStatus("error");
        throw new AuthenticationBootstrapError();
      }
      throw error;
    }
  }, [clearState]);

  const requestEmailChallenge = useCallback((email: string) => beeexyAuthApi.requestEmailChallenge({ email }), []);
  const resendEmailChallenge = requestEmailChallenge;

  const verifyEmail = useCallback(async (email: string, code: string) => {
    setStatus("authenticating");
    try {
      const response = await beeexyAuthApi.verifyEmail({ email, code });
      await finishAuthentication(response);
    } catch (error) {
      if (!beeexySessionStore.read()) setStatus("unauthenticated");
      throw error;
    }
  }, [finishAuthentication]);

  const authenticateWithGoogle = useCallback(async (credential: string) => {
    setStatus("authenticating");
    try {
      const response = await beeexyAuthApi.authenticateGoogle({ credential });
      await finishAuthentication(response);
    } catch (error) {
      if (!beeexySessionStore.read()) setStatus("unauthenticated");
      throw error;
    }
  }, [finishAuthentication]);

  const logout = useCallback(async () => {
    setStatus("signing-out");
    try {
      await logoutAndClearSession(beeexyAuthApi, beeexySessionStore);
    } catch {
      // Local cleanup is authoritative when the server already considers a session invalid.
    } finally {
      setSession(null);
      setAccount(null);
      setPatient(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    account,
    patient,
    session,
    status,
    authenticateWithGoogle,
    logout,
    requestEmailChallenge,
    resendEmailChallenge,
    retryBootstrap,
    verifyEmail,
  }), [account, authenticateWithGoogle, logout, patient, requestEmailChallenge, resendEmailChallenge, retryBootstrap, session, status, verifyEmail]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
