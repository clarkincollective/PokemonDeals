import { createClient } from "@supabase/supabase-js";

// This is the "public" client - safe to use in the browser.
// It can only do what your Supabase row-level-security rules allow (read-only, in our case).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
