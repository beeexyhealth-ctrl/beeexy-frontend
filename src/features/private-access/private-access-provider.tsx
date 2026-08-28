"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  beeexyPrivateAccessApi,
  type PrivateAccessLoginOutcome,
  type PrivateAccessLoginRequest,
  type PrivateAccessSessionStatus,
} from "@/lib/beeexy-api/private-access-api";
import { subscribeToPrivateAccessRequired } from "@/lib/beeexy-api/private-access-events";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { beeexySessionStore } from "@/lib/beeexy-api/session-storage";
import { PrivateAccessLoading } from "./private-access-loading";
import { PrivateAccessScreen } from "./private-access-screen";

export type PrivateAccessState = "checking" | "locked" | "submitting" | "unlocked";
export type PrivateAccessFeedbackKind = "invalid-input" | "invalid-credentials" | "rate-limit" | "temporary" | "expired";

export interface PrivateAccessFeedback {
  kind: PrivateAccessFeedbackKind;
  message: string;
}

type PrivateAccessContextValue = {
  exiting: boolean;
  feedback: PrivateAccessFeedback | null;
  loginOutcome: PrivateAccessLoginOutcome | null;
  retryAfterSeconds: number;
  session: PrivateAccessSessionStatus | null;
  state: PrivateAccessState;
  clearLoginOutcome(): void;
  exitDemo(logoutBeeexy: () => Promise<void>): Promise<void>;
  login(request: PrivateAccessLoginRequest): Promise<boolean>;
  logout(): Promise<void>;
  retrySessionCheck(): Promise<void>;
};

const PrivateAccessContext = createContext<PrivateAccessContextValue | null>(null);

export function PrivateAccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PrivateAccessState>("checking");
  const [session, setSession] = useState<PrivateAccessSessionStatus | null>(null);
  const [loginOutcome, setLoginOutcome] = useState<PrivateAccessLoginOutcome | null>(null);
  const [feedback, setFeedback] = useState<PrivateAccessFeedback | null>(null);
  const [exiting, setExiting] = useState(false);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const operationInFlight = useRef(false);

  const checkSession = useCallback(async () => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setState("checking");
    setFeedback(null);
    setLoginOutcome(null);

    try {
      const nextSession = await beeexyPrivateAccessApi.getPrivateAccessSession();
      setSession(nextSession);
      setState(nextSession.authenticated ? "unlocked" : "locked");
    } catch {
      setSession(null);
      setFeedback({
        kind: "temporary",
        message: "We could not verify private access right now. Check the connection and try again.",
      });
      setState("locked");
    } finally {
      operationInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void checkSession());
    return () => cancelAnimationFrame(frame);
  }, [checkSession]);

  useEffect(() => subscribeToPrivateAccessRequired(() => {
    operationInFlight.current = false;
    setSession(null);
    setLoginOutcome(null);
    setRetryUntil(null);
    setRetryAfterSeconds(0);
    setFeedback({
      kind: "expired",
      message: "Your private demo session ended. Enter the access details again.",
    });
    setState("locked");
  }), []);

  useEffect(() => {
    if (retryUntil === null) return;

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1_000));
      setRetryAfterSeconds(remaining);
      if (remaining === 0) setRetryUntil(null);
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(interval);
  }, [retryUntil]);

  const login = useCallback(async (request: PrivateAccessLoginRequest) => {
    if (operationInFlight.current || (retryUntil !== null && retryUntil > Date.now())) return false;
    operationInFlight.current = true;
    beeexySessionStore.clear();
    setFeedback(null);
    setState("submitting");
    let unlocked = false;

    try {
      const outcome = await beeexyPrivateAccessApi.loginPrivateAccess(request);
      setSession(null);
      setLoginOutcome(outcome);
      setRetryUntil(null);
      setRetryAfterSeconds(0);
      setState("unlocked");
      unlocked = true;
      return true;
    } catch (error) {
      setSession(null);
      setLoginOutcome(null);
      if (error instanceof BeeexyApiError && error.status === 400) {
        setFeedback({ kind: "invalid-input", message: "Complete all three fields and check their length before trying again." });
      } else if (error instanceof BeeexyApiError && error.status === 401) {
        setFeedback({ kind: "invalid-credentials", message: "The private access credentials are invalid." });
      } else if (error instanceof BeeexyApiError && error.status === 429) {
        const seconds = retryDelayInSeconds(error.retryAfter);
        setRetryUntil(Date.now() + seconds * 1_000);
        setRetryAfterSeconds(seconds);
        setFeedback({ kind: "rate-limit", message: "Too many attempts. Please wait before trying again." });
      } else {
        setFeedback({ kind: "temporary", message: "Beeexy could not check access right now. Please try again shortly." });
      }
      return false;
    } finally {
      operationInFlight.current = false;
      if (!unlocked) setState("locked");
    }
  }, [retryUntil]);

  const logout = useCallback(async () => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    try {
      await beeexyPrivateAccessApi.logoutPrivateAccess();
    } finally {
      setSession(null);
      setLoginOutcome(null);
      setFeedback(null);
      setRetryUntil(null);
      setRetryAfterSeconds(0);
      setState("locked");
      operationInFlight.current = false;
    }
  }, []);

  const exitDemo = useCallback(async (logoutBeeexy: () => Promise<void>) => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setExiting(true);
    setFeedback(null);

    try {
      await logoutBeeexy();
      await beeexyPrivateAccessApi.logoutPrivateAccess();
      setFeedback(null);
    } catch {
      setFeedback({
        kind: "temporary",
        message: "Beeexy signed out, but private demo exit could not finish. Check the connection before continuing.",
      });
    } finally {
      setSession(null);
      setLoginOutcome(null);
      setRetryUntil(null);
      setRetryAfterSeconds(0);
      setState("locked");
      setExiting(false);
      operationInFlight.current = false;
    }
  }, []);

  const value = useMemo<PrivateAccessContextValue>(() => ({
    exiting,
    feedback,
    loginOutcome,
    retryAfterSeconds,
    session,
    state,
    clearLoginOutcome: () => setLoginOutcome(null),
    exitDemo,
    login,
    logout,
    retrySessionCheck: checkSession,
  }), [checkSession, exitDemo, exiting, feedback, login, loginOutcome, logout, retryAfterSeconds, session, state]);

  return (
    <PrivateAccessContext.Provider value={value}>
      {state === "checking" && <PrivateAccessLoading />}
      {(state === "locked" || state === "submitting") && <PrivateAccessScreen />}
      {state === "unlocked" && children}
    </PrivateAccessContext.Provider>
  );
}

export function usePrivateAccess() {
  const context = useContext(PrivateAccessContext);
  if (!context) throw new Error("usePrivateAccess must be used inside PrivateAccessProvider.");
  return context;
}

function retryDelayInSeconds(value: string | undefined) {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.ceil(parsed)) : 60;
}
