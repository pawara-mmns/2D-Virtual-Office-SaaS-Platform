"use client";

import { createBrowserClient } from "@supabase/ssr";
import { authSetupMessage, getSupabaseConfig } from "./config";

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error(authSetupMessage);
  return createBrowserClient(config.url, config.key);
}
