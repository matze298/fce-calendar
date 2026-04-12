'use client';

import { useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('Anmeldung fehlgeschlagen: ' + error.message);
      setLoading(false);
    } else {
      router.push('/admin');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Brand Header */}
        <div className="bg-secondary p-8 flex flex-col items-center text-white">
          <Image 
            src="/fce-logo.png" 
            alt="FCE Logo" 
            width={80} 
            height={80} 
            className="mb-4 drop-shadow-lg"
          />
          <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">
            Interner Bereich
          </h1>
          <p className="text-sm text-gray-300 mt-2 italic">1. FC Egenhausen 1921 e.V.</p>
        </div>

        {/* Form Container */}
        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-secondary mb-2 uppercase tracking-wide">
                Email Adresse
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-100 focus:border-primary focus:outline-none transition-colors text-secondary"
                placeholder="beispiel@fce.de"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-secondary mb-2 uppercase tracking-wide">
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-100 focus:border-primary focus:outline-none transition-colors text-secondary"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg font-medium border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-secondary font-black py-4 rounded-xl shadow-md hover:opacity-90 transition-all disabled:opacity-50 uppercase tracking-widest"
            >
              {loading ? 'Wird angemeldet...' : 'Anmelden'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted">
              Noch kein Konto?{' '}
              <Link href="/register" className="text-secondary font-bold hover:underline">
                Hier registrieren
              </Link>
            </p>
          </div>

          {/* Local Test Hint */}
          <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-[10px] uppercase font-bold text-muted mb-2">Test-Zugang (Lokal):</p>
            <p className="text-xs text-secondary font-mono">User: matze29894@gmail.com</p>
            <p className="text-xs text-secondary font-mono">Pass: devpassword</p>
          </div>

        </div>
      </div>
      
      <button 
        onClick={() => router.push('/')}
        className="mt-8 text-sm text-muted hover:text-secondary font-medium transition-colors"
      >
        ← Zurück zur Startseite
      </button>
    </div>
  );
}
