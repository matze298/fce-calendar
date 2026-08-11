import { supabase } from '@/utils/supabase';

export type MemberAccess =
  | { state: 'ok'; member: { id: string; name: string }; isAdmin: boolean }
  | { state: 'unauthenticated' }
  | { state: 'pending' }
  | { state: 'error'; message: string };

/**
 * Whether the signed-in user may see the duty plan, and who they are.
 *
 * `pending` covers both an account with no members row and one that is not approved. They differ
 * mechanically and mean the same thing to the person reading the screen: an administrator has not
 * finished processing them. `error` is different from both: it means the check itself could not be
 * carried out, most likely a transient failure such as `AuthRetryableFetchError`, which also
 * reports a null user. Treating that as `unauthenticated` or `pending` would tell a signed-in,
 * approved member something false about their own account.
 *
 * This is a convenience check for the UI, not a security boundary. Row Level Security is what
 * protects the data, and `published_schedule` returns nothing to an unapproved caller regardless of
 * what any page does.
 */
export async function checkMemberAccess(): Promise<MemberAccess> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) return { state: 'error', message: userError.message };
  if (!user) return { state: 'unauthenticated' };

  // maybeSingle rather than single: no row is the normal state for an unlinked registration, and
  // single treats that as an error.
  const { data: profile, error: profileError } = await supabase
    .from('members')
    .select('id, name, is_approved, is_admin')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (profileError) return { state: 'error', message: profileError.message };
  if (!profile || !profile.is_approved) return { state: 'pending' };

  return {
    state: 'ok',
    member: { id: profile.id, name: profile.name },
    isAdmin: profile.is_admin,
  };
}
