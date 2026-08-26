"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { usePrivateAccess } from "@/features/private-access/private-access-provider";

export function SignOutButton() {
  const router = useRouter();
  const { logout } = useAuth();
  const { exitDemo } = usePrivateAccess();
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    await exitDemo(logout);
    router.replace("/");
    router.refresh();
  }

  return <button className="button danger wide" type="button" disabled={pending} onClick={() => void signOut()}>{pending ? "Signing out…" : "Sign out"}</button>;
}
