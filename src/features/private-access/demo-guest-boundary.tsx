"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BeeexyBrand } from "@/features/entry/beeexy-brand";
import { EntryLoading } from "@/features/entry/entry-loading";
import { useAuth } from "@/features/auth/auth-provider";
import { beeexyPrivateAccessApi } from "@/lib/beeexy-api/private-access-api";
import { isPrivateAccessRequiredError } from "@/lib/beeexy-api/private-access-events";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { usePrivateAccess } from "./private-access-provider";

type DemoGuestFailure = "unavailable" | "temporary";

export function DemoGuestBoundary({ children }: { children: React.ReactNode }) {
  const { hydrateAuthentication, status } = useAuth();
  const { exiting } = usePrivateAccess();
  const [failure, setFailure] = useState<DemoGuestFailure | null>(null);
  const requestInFlight = useRef(false);

  const requestDemoGuest = useCallback(async () => {
    if (requestInFlight.current || exiting) return;
    requestInFlight.current = true;
    setFailure(null);

    try {
      const response = await beeexyPrivateAccessApi.createDemoGuestSession();
      await hydrateAuthentication(response);
    } catch (error) {
      if (isPrivateAccessRequiredError(error)) return;
      setFailure(error instanceof BeeexyApiError && error.status === 503 ? "unavailable" : "temporary");
    } finally {
      requestInFlight.current = false;
    }
  }, [exiting, hydrateAuthentication]);

  useEffect(() => {
    if (status !== "unauthenticated" || exiting || failure) return;
    const frame = requestAnimationFrame(() => void requestDemoGuest());
    return () => cancelAnimationFrame(frame);
  }, [exiting, failure, requestDemoGuest, status]);

  if (status === "authenticated" || status === "error") return children;
  if (failure) {
    const unavailable = failure === "unavailable";
    return (
      <main className="entry-shell auth-bootstrap-error demo-guest-error">
        <BeeexyBrand />
        <section aria-labelledby="demo-guest-error-heading">
          <p className="entry-eyebrow">Private demo</p>
          <h1 id="demo-guest-error-heading">
            {unavailable ? "The demo is temporarily unavailable." : "We could not start the demo session."}
          </h1>
          <p>
            {unavailable
              ? "The shared demo account needs attention from the Beeexy team. Please try again later."
              : "Check the connection and try again. Your private access remains active."}
          </p>
          <button className="entry-primary-button" type="button" onClick={() => void requestDemoGuest()}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  return <EntryLoading />;
}
