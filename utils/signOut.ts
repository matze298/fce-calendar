import { errorMessage } from '@/utils/errors';
import { supabase } from '@/utils/supabase';

/**
 * Ends the session and returns the visitor to the login page.
 *
 * Reports a failure rather than redirecting anyway, because somebody who believes they have signed
 * out and has not is worse off than somebody looking at an error.
 */
export async function signOutAndRedirect(router: {
  push: (path: string) => void;
}): Promise<string | null> {
  const { error } = await supabase.auth.signOut();
  if (error) return errorMessage(error);

  router.push('/login');
  return null;
}
