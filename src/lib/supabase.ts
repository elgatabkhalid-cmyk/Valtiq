import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true quand la page est ouverte depuis le lien « mot de passe oublié » (lu avant que Supabase n'efface l'adresse). */
export const recoveryInUrl = typeof window !== "undefined" && /(^|[#&?])type=recovery(&|$)/.test(window.location.hash + window.location.search);

export const supabaseUrl = url ?? "";
export const supabaseKey = key ?? "";
export const supabaseConfigured = Boolean(url && key && !url.includes("YOUR_PROJECT"));
export const supabase = supabaseConfigured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
