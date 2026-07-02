import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase env vars are not configured');
    return null;
  }

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase initialized');
    return client;
  } catch (error) {
    console.error('Failed to create Supabase client:', error);
    return null;
  }
}
