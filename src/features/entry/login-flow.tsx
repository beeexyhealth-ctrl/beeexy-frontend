"use client";

import { FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { AuthenticationBootstrapError, useAuth } from "@/features/auth/auth-provider";
import { GoogleSignInButton } from "@/features/auth/google-sign-in-button";
import { challengeErrorMessage, googleErrorMessage, verificationErrorMessage } from "@/features/auth/login-error-messages";
import { BeeexyBrand } from "./beeexy-brand";

type AuthStage = "email" | "otp" | "transition";
type PendingAction = "challenge" | "verify" | "resend" | "google" | "bootstrap" | null;

export function LoginFlow() {
  const router = useRouter();
  const emailId = useId();
  const otpId = useId();
  const { authenticateWithGoogle, requestEmailChallenge, resendEmailChallenge, retryBootstrap, verifyEmail } = useAuth();
  const [stage, setStage] = useState<AuthStage>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);

  function setFeedback(text: string, isError = false) {
    setMessage(text);
    setMessageIsError(isError);
  }

  async function showOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const normalizedEmail = email.trim();
    setPending("challenge");
    setFeedback("");

    try {
      await requestEmailChallenge(normalizedEmail);
      setEmail(normalizedEmail);
      setOtp("");
      setStage("otp");
      setFeedback("A six-digit code was sent. Check your inbox and enter it below.");
    } catch (error) {
      setFeedback(challengeErrorMessage(error), true);
    } finally {
      setPending(null);
    }
  }

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || otp.length !== 6) return;
    setPending("verify");
    setFeedback("");

    try {
      await verifyEmail(email, otp);
      setStage("transition");
      router.replace("/home");
    } catch (error) {
      if (error instanceof AuthenticationBootstrapError) {
        setStage("transition");
        setFeedback("Your session was created, but Beeexy couldn’t finish loading your account.", true);
      } else {
        setFeedback(verificationErrorMessage(error), true);
      }
    } finally {
      setPending(null);
    }
  }

  function changeEmail() {
    if (pending) return;
    setOtp("");
    setFeedback("");
    setStage("email");
  }

  async function resendCode() {
    if (pending) return;
    setPending("resend");
    setFeedback("");

    try {
      await resendEmailChallenge(email);
      setFeedback("A new code was requested. Check your inbox.");
    } catch (error) {
      setFeedback(challengeErrorMessage(error, true), true);
    } finally {
      setPending(null);
    }
  }

  async function continueWithGoogle(credential: string) {
    if (pending) return;
    setPending("google");
    setFeedback("");

    try {
      await authenticateWithGoogle(credential);
      setStage("transition");
      router.replace("/home");
    } catch (error) {
      if (error instanceof AuthenticationBootstrapError) {
        setStage("transition");
        setFeedback("Your session was created, but Beeexy couldn’t finish loading your account.", true);
      } else {
        setFeedback(googleErrorMessage(error), true);
      }
    } finally {
      setPending(null);
    }
  }

  async function retryAccountBootstrap() {
    if (pending) return;
    setPending("bootstrap");
    setFeedback("");
    try {
      await retryBootstrap();
      router.replace("/home");
    } catch {
      setFeedback("Beeexy still couldn’t load your account. Check the backend connection and try again.", true);
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="entry-shell login-shell">
      <div className="entry-ambient login-ambient" aria-hidden="true"><i /><i /><i /></div>
      <div className="login-stage">
        <header className="login-header"><BeeexyBrand /></header>
        <section className="login-content" aria-labelledby="login-heading">
          {stage === "email" && (
            <div className="login-view" key="email">
              <div className="login-heading">
                <p className="entry-eyebrow">Beeexy account</p>
                <h1 id="login-heading">Welcome to <em>Beeexy.</em></h1>
                <p>Sign in or create your account to continue.</p>
              </div>

              <form className="login-form" onSubmit={showOtp}>
                <label htmlFor={emailId}>Email address</label>
                <div className="entry-input">
                  <Icon name="mail" size={18} />
                  <input id={emailId} type="email" inputMode="email" autoComplete="email" required disabled={pending !== null} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                </div>
                <button className="entry-primary-button" type="submit" disabled={pending !== null}>{pending === "challenge" ? "Sending code…" : <>Continue with email<Icon name="chevron-right" size={18} /></>}</button>
              </form>

              <div className="login-divider"><span>or</span></div>
              <GoogleSignInButton disabled={pending !== null} pending={pending === "google"} onCredential={continueWithGoogle} onUnavailable={() => setFeedback("Google sign-in is unavailable right now. You can continue with email.", true)} />
              {message && <p className="login-message" role={messageIsError ? "alert" : "status"}>{message}</p>}
            </div>
          )}

          {stage === "otp" && (
            <div className="login-view otp-view" key="otp">
              <button className="login-back-button" type="button" disabled={pending !== null} onClick={changeEmail}><Icon name="arrow-left" size={17} />Change email</button>
              <span className="otp-mail-mark" aria-hidden="true"><Icon name="mail" size={25} /><i><Icon name="check" size={11} /></i></span>
              <div className="login-heading">
                <p className="entry-eyebrow">Check your inbox</p>
                <h1 id="login-heading">Enter your 6-digit code</h1>
                <p>We’ll use the code sent to <strong>{email}</strong> to confirm it’s you.</p>
              </div>

              <form className="login-form otp-form" onSubmit={submitOtp}>
                <label htmlFor={otpId}>Verification code</label>
                <input className="entry-otp-input" id={otpId} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus disabled={pending !== null} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} aria-describedby={`${otpId}-hint`} />
                <p className="field-hint" id={`${otpId}-hint`}>Enter all six numbers. You can paste the code.</p>
                <button className="entry-primary-button" type="submit" disabled={pending !== null || otp.length !== 6}>{pending === "verify" ? "Verifying…" : "Verify code"}</button>
              </form>

              <div className="otp-secondary-actions">
                <span>Didn’t receive it?</span>
                <button type="button" disabled={pending !== null} onClick={() => void resendCode()}>{pending === "resend" ? "Requesting…" : "Resend code"}</button>
              </div>
              {message && <p className="login-message" role={messageIsError ? "alert" : "status"}>{message}</p>}
            </div>
          )}

          {stage === "transition" && <AuthTransition pending={pending === "bootstrap"} error={messageIsError ? message : ""} retry={retryAccountBootstrap} />}
        </section>

        <footer className="login-footer">
          <p>By continuing, you agree to Beeexy’s Terms and acknowledge its Privacy Policy.</p>
          <span><Icon name="shield" size={14} />Your information stays protected.</span>
        </footer>
      </div>
    </main>
  );
}

function AuthTransition({ error, pending, retry }: { error: string; pending: boolean; retry: () => Promise<void> }) {
  return (
    <div className="login-view auth-transition" role="status" aria-live="polite">
      <span className="auth-transition-mark"><Icon name={error ? "info" : "check"} size={26} /></span>
      <div className="login-heading">
        <p className="entry-eyebrow">{error ? "Almost there" : "You’re all set"}</p>
        <h1 id="login-heading">{error ? "Finish loading your account" : "Opening Beeexy"}</h1>
        <p>{error || "Your account and patient profile are ready."}</p>
      </div>
      {error ? <button className="entry-primary-button" type="button" disabled={pending} onClick={() => void retry()}>{pending ? "Trying again…" : "Try again"}</button> : <span className="entry-loading-line" aria-hidden="true" />}
    </div>
  );
}
