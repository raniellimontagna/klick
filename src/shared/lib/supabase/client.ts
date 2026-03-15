import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database';
import { supabaseEnv } from './env';

let cachedClient: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!supabaseEnv.isConfigured) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }

  return cachedClient;
}
