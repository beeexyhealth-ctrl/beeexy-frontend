"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BeeexyBrand } from "@/features/entry/beeexy-brand";
import { EntryLoading } from "@/features/entry/entry-loading";
import { usePatients } from "@/features/my-circle/patient-provider";
import { isPrimaryProfileComplete } from "@/features/my-circle/patient-state";
import { usePreTriage } from "@/features/pre-triage/pre-triage-provider";
import { usePrivateAccess } from "@/features/private-access/private-access-provider";
import { useAuth } from "./auth-provider";

const PUBLIC_ENTRY_ROUTES = new Set(["/", "/login", "/onboarding", "/sign-in"]);
const INITIAL_CARE_ROUTES = new Set(["/care-choice", "/my-health/circle/add"]);

export function isGuestPreTriageRoute(pathname: string) {
  return pathname.startsWith("/pre-triage/") && !pathname.endsWith("/claim");
}

export function isPublicDirectoryRoute(pathname: string) {
  return pathname === "/doctors"
    || pathname === "/clinics"
    || /^\/doctors\/[^/]+$/.test(pathname)
    || /^\/clinics\/[^/]+$/.test(pathname);
}

export function isPublicRoute(pathname: string) {
  return PUBLIC_ENTRY_ROUTES.has(pathname) || isGuestPreTriageRoute(pathname) || isPublicDirectoryRoute(pathname);
}

export function postAuthDestination(pendingClaimRoute: string | null) {
  return pendingClaimRoute || "/home";
}

export function AuthRouteBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, retryBootstrap, status } = useAuth();
  const { exitDemo } = usePrivateAccess();
  const { pendingClaimRoute } = usePreTriage();
  const {
    activePatient,
    bootstrapStatus: patientStatus,
    careChoiceComplete,
    primaryPatient,
    retryBootstrap: retryPatientBootstrap,
  } = usePatients();
  const isPublicEntry = PUBLIC_ENTRY_ROUTES.has(pathname);
  const isPublic = isPublicRoute(pathname);
  const profileComplete = primaryPatient ? isPrimaryProfileComplete(primaryPatient) : false;

  useEffect(() => {
    if (status === "unauthenticated" && !isPublic) router.replace("/login");
    if (status !== "authenticated" || patientStatus !== "ready") return;
    if (!profileComplete && pathname !== "/complete-profile") {
      router.replace("/complete-profile");
      return;
    }
    if (!profileComplete) return;
    if (!careChoiceComplete && !INITIAL_CARE_ROUTES.has(pathname)) {
      router.replace("/care-choice");
      return;
    }
    if (careChoiceComplete && (isPublicEntry || pathname === "/complete-profile" || pathname === "/care-choice")) {
      router.replace(postAuthDestination(pendingClaimRoute));
    }
  }, [careChoiceComplete, isPublic, isPublicEntry, pathname, patientStatus, pendingClaimRoute, profileComplete, router, status]);

  if (status === "bootstrapping" || status === "authenticating" || status === "signing-out") return <EntryLoading />;
  if (status === "unauthenticated" && !isPublic) return <EntryLoading />;
  if (status === "authenticated" && (patientStatus === "idle" || patientStatus === "loading")) return <EntryLoading />;
  if (status === "authenticated" && patientStatus === "ready") {
    if (!profileComplete && pathname !== "/complete-profile") return <EntryLoading />;
    if (profileComplete && !careChoiceComplete && !INITIAL_CARE_ROUTES.has(pathname)) return <EntryLoading />;
    if (profileComplete && careChoiceComplete && (isPublicEntry || pathname === "/complete-profile" || pathname === "/care-choice")) return <EntryLoading />;
    if (profileComplete && !activePatient && !INITIAL_CARE_ROUTES.has(pathname)) return <EntryLoading />;
  }

  if (status === "error") {
    return (
      <main className="entry-shell auth-bootstrap-error">
        <BeeexyBrand />
        <section aria-labelledby="bootstrap-error-heading">
          <p className="entry-eyebrow">Connection interrupted</p>
          <h1 id="bootstrap-error-heading">We couldn’t finish loading your account.</h1>
          <p>Your session is still stored securely on this device. Check the backend connection and try again.</p>
          <button className="entry-primary-button" type="button" onClick={() => void retryBootstrap()}>Try again</button>
          <button className="text-button" type="button" onClick={() => void exitDemo(logout)}>Sign out</button>
        </section>
      </main>
    );
  }

  if (status === "authenticated" && patientStatus === "error") {
    return (
      <main className="entry-shell auth-bootstrap-error">
        <BeeexyBrand />
        <section aria-labelledby="patient-bootstrap-error-heading">
          <p className="entry-eyebrow">My Circle unavailable</p>
          <h1 id="patient-bootstrap-error-heading">We couldn’t load your patient profiles.</h1>
          <p>Your account is signed in. Try loading My Circle again before continuing.</p>
          <button className="entry-primary-button" type="button" onClick={() => void retryPatientBootstrap()}>Try again</button>
          <button className="text-button" type="button" onClick={() => void exitDemo(logout)}>Sign out</button>
        </section>
      </main>
    );
  }

  return children;
}
