"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"email" | "otp">("email");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Connect Supabase in .env.local to enable real email sign-in.");
      return;
    }
    setPending(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setPending(false);
    if (error) return setMessage(error.message);
    setMessage("We sent a six-digit code to your email.");
    setStage("otp");
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    setPending(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    setPending(false);
    if (error) return setMessage(error.message);
    router.replace("/");
    router.refresh();
  }

  return <form className="auth-form reference-auth-form" onSubmit={stage === "email" ? requestOtp : verifyOtp}>{stage === "email" ? <><label htmlFor="email">Email address</label><div className="auth-input"><Icon name="mail" size={16} /><input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div><button className="button primary wide" disabled={pending}>{pending ? "Sending…" : <>Continue with email <Icon name="chevron-right" size={14} /></>}</button><div className="auth-divider"><span>or</span></div><button className="social-button" type="button" disabled><span>G</span>Continue with Google<small>Coming soon</small></button><button className="social-button" type="button" disabled><Icon name="apple" size={17} />Continue with Apple<small>Coming soon</small></button></> : <><div className="otp-icon"><Icon name="mail" size={19} /></div><label htmlFor="otp">Enter the six-digit code sent to {email}</label><input className="otp-input" id="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="000000" /><button className="button primary wide" disabled={pending || otp.length !== 6}>{pending ? "Checking…" : "Verify code"}</button><button className="text-button" type="button" onClick={() => setStage("email")}>Use another email</button></>}{message && <p className="form-message" role="status">{message}</p>}</form>;
}
