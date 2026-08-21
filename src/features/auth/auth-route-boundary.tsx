"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BeeexyBrand } from "@/features/entry/beeexy-brand";
import { EntryLoading } from "@/features/entry/entry-loading";
import { usePatients } from "@/features/my-circle/patient-provider";
import { isPrimaryProfileComplete } from "@/features/my-circle/patient-state";
import { useAuth } from "./auth-provider";

const PUBLIC_ROUTES = new Set(["/", "/login", "/onboarding", "/sign-in"]);
const INITIAL_CARE_ROUTES = new Set(["/care-choice", "/my-health/circle/add"]);

export function AuthRouteBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, retryBootstrap, status } = useAuth();
  const {
    activePatient,
    bootstrapStatus: patientStatus,
    careChoiceComplete,
    primaryPatient,
    retryBootstrap: retryPatientBootstrap,
  } = usePatients();
  const isPublic = PUBLIC_ROUTES.has(pathname);
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
    if (careChoiceComplete && (isPublic || pathname === "/complete-profile" || pathname === "/care-choice")) {
      router.replace("/home");
    }
  }, [careChoiceComplete, isPublic, pathname, patientStatus, profileComplete, router, status]);

  if (status === "bootstrapping" || status === "authenticating" || status === "signing-out") return <EntryLoading />;
  if (status === "unauthenticated" && !isPublic) return <EntryLoading />;
  if (status === "authenticated" && (patientStatus === "idle" || patientStatus === "loading")) return <EntryLoading />;
  if (status === "authenticated" && patientStatus === "ready") {
    if (!profileComplete && pathname !== "/complete-profile") return <EntryLoading />;
    if (profileComplete && !careChoiceComplete && !INITIAL_CARE_ROUTES.has(pathname)) return <EntryLoading />;
    if (profileComplete && careChoiceComplete && (isPublic || pathname === "/complete-profile" || pathname === "/care-choice")) return <EntryLoading />;
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
          <button className="text-button" type="button" onClick={() => void logout()}>Sign out</button>
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
          <button className="text-button" type="button" onClick={() => void logout()}>Sign out</button>
        </section>
      </main>
    );
  }

  return children;
}
