"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { beeexyApiConfig } from "@/lib/beeexy-api/config";
import { GoogleMark } from "@/features/entry/google-mark";

type GoogleSignInButtonProps = {
  disabled?: boolean;
  pending?: boolean;
  onCredential(credential: string): void | Promise<void>;
  onUnavailable(): void;
};

export function GoogleSignInButton({ disabled = false, onCredential, onUnavailable, pending = false }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const credentialHandlerRef = useRef(onCredential);
  const unavailableHandlerRef = useRef(onUnavailable);
  const [scriptReady, setScriptReady] = useState(false);
  const clientId = beeexyApiConfig.googleClientId;

  useEffect(() => {
    credentialHandlerRef.current = onCredential;
    unavailableHandlerRef.current = onUnavailable;
  }, [onCredential, onUnavailable]);

  useEffect(() => {
    if (!scriptReady || !clientId || !containerRef.current || !window.google?.accounts?.id) return;
    const container = containerRef.current;
    container.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) void credentialHandlerRef.current(response.credential);
        else unavailableHandlerRef.current();
      },
    });
    window.google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "continue_with",
      width: Math.min(400, Math.max(280, container.clientWidth)),
    });
  }, [clientId, scriptReady]);

  if (!clientId) {
    return <button className="google-button" type="button" disabled onClick={onUnavailable}><GoogleMark />Google sign-in unavailable</button>;
  }

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setScriptReady(true)} onError={onUnavailable} />
      <div className={`google-signin${pending ? " pending" : ""}${disabled ? " disabled" : ""}`} aria-busy={pending || undefined}>
        <div className="google-render-target" ref={containerRef} />
        {!scriptReady && <span className="google-loading"><GoogleMark />Loading Google sign-in…</span>}
        {pending && <span className="google-loading"><GoogleMark />Connecting to Google…</span>}
        {disabled && <span className="google-blocker" aria-hidden="true" />}
      </div>
    </>
  );
}
