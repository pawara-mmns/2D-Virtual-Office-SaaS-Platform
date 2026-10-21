import assert from "node:assert/strict";
import { test } from "node:test";
import { getSupabaseConfig } from "./config.ts";

test("configuration rejects missing values, secret keys, and unsafe URLs", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    assert.equal(getSupabaseConfig(), null);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_test";
    assert.equal(getSupabaseConfig(), null);
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    for (const url of ["broken", "http://remote.example", "https://user:pass@project.supabase.co", "https://project.supabase.co/path", "https://project.supabase.co?token=bad"]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      assert.equal(getSupabaseConfig(), null);
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    assert.deepEqual(getSupabaseConfig(), { url: "https://project.supabase.co", key: "sb_publishable_test" });
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
