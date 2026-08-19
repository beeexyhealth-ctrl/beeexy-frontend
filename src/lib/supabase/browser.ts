"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey } = getSupabaseConfig();
  return createBrowserClient(url, anonKey);
}
