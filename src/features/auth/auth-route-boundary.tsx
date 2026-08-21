"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BeeexyBrand } from "@/features/entry/beeexy-brand";
import { EntryLoading } from "@/features/entry/entry-loading";
import { useAuth } from "./auth-provider";

const PUBLIC_ROUTES = new Set(["/", "/login", "/onboarding", "/sign-in"]);

export function AuthRouteBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, retryBootstrap, status } = useAuth();
  const isPublic = PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    if (status === "authenticated" && isPublic) router.replace("/home");
    if (status === "unauthenticated" && !isPublic) router.replace("/login");
  }, [isPublic, router, status]);

  if (status === "bootstrapping" || status === "authenticating" || status === "signing-out") return <EntryLoading />;
  if (status === "authenticated" && isPublic) return <EntryLoading />;
  if (status === "unauthenticated" && !isPublic) return <EntryLoading />;

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

  return children;
}
