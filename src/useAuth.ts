import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export const SUPABASE_ENABLED = !!import.meta.env.VITE_SUPABASE_URL

export type AuthState = {
  user: User | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(SUPABASE_ENABLED)

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
