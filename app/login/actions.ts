'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginAction(email: string, password: string): Promise<string | null> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return 'אימייל או סיסמה שגויים'
  redirect('/dashboard')
}
