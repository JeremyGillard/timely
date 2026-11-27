import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Lazily created so the app never touches the network unless sync is used. */
export function supabase(): SupabaseClient {
  if (!client) {
    const { supabaseUrl, supabaseKey } = useRuntimeConfig().public;
    client = createClient(supabaseUrl as string, supabaseKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}
