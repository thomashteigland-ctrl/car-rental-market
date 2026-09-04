import { createClient } from "@supabase/supabase-js";

const url =
  process.env.PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";
const key =
  process.env.PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const supabase = createClient(url, key, {
  db: { schema: "rental" },
  auth: { persistSession: false, autoRefreshToken: false },
});

export function requireEnv() {
  if (!url || !key) {
    throw new Error(
      "Missing PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_*)",
    );
  }
}
