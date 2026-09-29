import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined

// Sin variables de entorno la app funciona en modo local (solo este dispositivo).
export const supabase = SUPABASE_URL && key ? createClient(SUPABASE_URL, key) : null
