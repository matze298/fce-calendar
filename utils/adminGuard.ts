import { supabase } from '@/utils/supabase';

export type AdminAccess = 'ok' | 'unauthenticated' | 'forbidden';

/**
 * Whether the signed-in user may use the admin area. Reporting the outcome rather than
 * redirecting leaves each page free to send a visitor somewhere different, or to render
 * an access-denied view instead.
 *
 * This is a convenience check for the UI, not a security boundary. Row Level Security in
 * Supabase is what actually protects the data.
 */
export async function checkAdminAccess(): Promise<AdminAccess> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'unauthenticated';

  const { data: profile } = await supabase
    .from('members')
    .select('is_admin, is_approved')
    .eq('auth_id', user.id)
    .single();

  if (!profile || !profile.is_admin || !profile.is_approved) return 'forbidden';

  return 'ok';
}
