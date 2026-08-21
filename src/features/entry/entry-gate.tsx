"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EntryLoading } from "./entry-loading";
import { hasCompletedOnboarding } from "./onboarding-storage";
import { useAuth } from "@/features/auth/auth-provider";

export function EntryGate() {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    router.replace(hasCompletedOnboarding() ? "/login" : "/onboarding?step=1");
  }, [router, status]);

  return <EntryLoading />;
}
