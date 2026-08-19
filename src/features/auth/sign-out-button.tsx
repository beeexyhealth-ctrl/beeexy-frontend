"use client";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
export function SignOutButton() { const router = useRouter(); return <button className="button danger wide" onClick={async () => { await createSupabaseBrowserClient()?.auth.signOut(); router.replace("/"); router.refresh(); }}>Sign out</button>; }
