import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS entirely. Only for code paths with
 * no user session to scope RLS to, i.e. the cron routes in
 * src/app/api/cron/*. Every other route uses the cookie-scoped client
 * from lib/supabase/server.ts so RLS stays the actual privilege boundary.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
