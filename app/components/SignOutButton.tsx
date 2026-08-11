'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { signOutAndRedirect } from '@/utils/signOut';

/**
 * Ends the session from wherever a visitor can get stuck.
 *
 * `header` assumes the dark header background it is normally placed on. `card` is for the white
 * cards rendered by early-return states like a pending registration or a denied admin visit, where
 * the header's white-on-white styling would be invisible.
 */
export function SignOutButton({ variant = 'header' }: { variant?: 'header' | 'card' }) {
  const [failure, setFailure] = useState<string | null>(null);
  const router = useRouter();

  const buttonClasses =
    variant === 'card'
      ? 'bg-secondary text-white hover:opacity-90'
      : 'bg-white/10 text-white border border-white/20 hover:bg-white/20';

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={async () => setFailure(await signOutAndRedirect(router))}
        className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${buttonClasses}`}
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
