'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { signOutAndRedirect } from '@/utils/signOut';

/**
 * Ends the session from wherever a visitor can get stuck.
 *
 * The club yellow is deliberate: it appears nowhere else in either header or in the early-return
 * cards, so leaving is never mistaken for the navigation link or the primary button beside it.
 * `variant` only picks the failure message's color, since the surrounding background differs.
 */
export function SignOutButton({ variant = 'header' }: { variant?: 'header' | 'card' }) {
  const [failure, setFailure] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={async () => setFailure(await signOutAndRedirect(router))}
        className="bg-primary text-secondary px-4 py-2 rounded-lg font-bold text-sm transition-all hover:opacity-90"
      >
        Abmelden
      </button>
      {failure && (
        <span className={variant === 'card' ? 'text-xs text-secondary' : 'text-xs text-white'}>
          Abmelden fehlgeschlagen: {failure}
        </span>
      )}
    </div>
  );
}
