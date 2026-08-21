"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";

export function SignOutButton() {
  const router = useRouter();
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    await logout();
    router.replace("/login");
    router.refresh();
  }

  return <button className="button danger wide" type="button" disabled={pending} onClick={() => void signOut()}>{pending ? "Signing out…" : "Sign out"}</button>;
}
