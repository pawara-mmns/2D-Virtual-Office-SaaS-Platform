"use client";

import { createBrowserClient } from "@supabase/ssr";
import { authSetupMessage, getSupabaseConfig } from "./config";
import type { Database } from "./database.types";

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error(authSetupMessage);
  return createBrowserClient<Database>(config.url, config.key);
}
