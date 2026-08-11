'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { signOutAndRedirect } from '@/utils/signOut';

export function SignOutButton() {
  const [failure, setFailure] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={async () => setFailure(await signOutAndRedirect(router))}
        className="bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg font-bold text-sm hover:bg-white/20 transition-all"
      >
        Abmelden
      </button>
      {failure && <span className="text-xs text-white">Abmelden fehlgeschlagen: {failure}</span>}
    </div>
  );
}
