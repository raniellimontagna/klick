const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const AUTH_CALLBACK_PATH = '/auth/callback';

export const supabaseEnv = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  isConfigured: SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0,
};
