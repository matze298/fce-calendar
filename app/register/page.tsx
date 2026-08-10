'use client';

import { useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.');
      setLoading(false);
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      setError('Bitte geben Sie Vor- und Nachnamen an.');
      setLoading(false);
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName.trim(), last_name: lastName.trim() },
      },
    });

    if (signUpError) {
      setError('Registrierung fehlgeschlagen: ' + signUpError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push('/login'), 3000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-secondary p-8 flex flex-col items-center text-white">
          <Image src="/fce-logo.png" alt="FCE Logo" width={60} height={66} className="mb-4" />
          <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">Konto erstellen</h1>
        </div>

        <div className="p-8">
          {success ? (
            <div className="text-center space-y-4">
              <div className="text-green-600 font-bold text-lg">Registrierung erfolgreich!</div>
              <p className="text-muted text-sm">
                Bitte prüfen Sie Ihre E-Mails, um Ihr Konto zu bestätigen (falls konfiguriert).
                Ein Administrator ordnet Ihre Registrierung anschließend Ihrem Mitgliedseintrag zu.
              </p>
              <Link href="/login" className="block text-primary font-bold hover:underline">
                Direkt zum Login →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-secondary mb-1 uppercase">Vorname</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border-2 border-gray-100 focus:border-primary focus:outline-none text-secondary"
                  placeholder="Thomas"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-secondary mb-1 uppercase">Nachname</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border-2 border-gray-100 focus:border-primary focus:outline-none text-secondary"
                  placeholder="Müller"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-secondary mb-1 uppercase">Email Adresse</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border-2 border-gray-100 focus:border-primary focus:outline-none text-secondary"
                  placeholder="beispiel@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-secondary mb-1 uppercase">Passwort</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border-2 border-gray-100 focus:border-primary focus:outline-none text-secondary"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-secondary mb-1 uppercase">Passwort bestätigen</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border-2 border-gray-100 focus:border-primary focus:outline-none text-secondary"
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 italic">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-secondary font-black py-4 rounded-xl shadow-md hover:opacity-90 transition-all disabled:opacity-50 uppercase tracking-widest mt-4"
              >
                {loading ? 'Wird erstellt...' : 'Registrieren'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-muted">
              Bereits ein Konto?{' '}
              <Link href="/login" className="text-secondary font-bold hover:underline">
                Hier anmelden
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
