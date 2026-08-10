'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { readStartTimeDefaults, START_TIME_FALLBACKS, StartTimeDefaults } from '@/utils/startTime';
import { checkAdminAccess } from '@/utils/adminGuard';
import { errorMessage } from '@/utils/errors';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [cooldownDays, setCooldownDays] = useState(21);
  const [timeDefaults, setTimeDefaults] = useState<StartTimeDefaults>(START_TIME_FALLBACKS);
  const [isSaving, setIsSaving] = useState(false);

  const router = useRouter();

  // Rendered once, in the form below, so it stays local to the component.
  const timeFields: { key: keyof StartTimeDefaults; id: string; label: string }[] = [
    { key: 'default_start_time_mon_thu', id: 'default-mon-thu', label: 'MONTAG BIS DONNERSTAG' },
    { key: 'default_start_time_fri', id: 'default-fri', label: 'FREITAG' },
    { key: 'default_start_time_sat_sun', id: 'default-sat-sun', label: 'SAMSTAG UND SONNTAG' },
  ];

  const fetchSettings = useCallback(async () => {
    const access = await checkAdminAccess();
    if (access === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (access === 'forbidden') {
      router.push('/admin');
      return;
    }

    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching settings:', error.message);
    } else if (data) {
      setSettingsId(data.id);
      setCooldownDays(data.cooldown_days);
      setTimeDefaults(readStartTimeDefaults(data));
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async () => {
    if (settingsId === null) {
      alert('Einstellungen konnten nicht geladen werden. Bitte laden Sie die Seite neu.');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update({
          cooldown_days: cooldownDays,
          ...timeDefaults,
          last_updated: new Date().toISOString()
        })
        .eq('id', settingsId);

      if (error) throw error;
      alert('Einstellungen wurden erfolgreich gespeichert.');
    } catch (err) {
      alert('Fehler beim Speichern der Einstellungen: ' + errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Lade Einstellungen...</div>;

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="bg-secondary text-white py-6 px-4 shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Image src="/fce-logo.png" alt="Logo" width={40} height={44} className="hover:opacity-80 transition-opacity cursor-pointer" />
            </Link>
            <h1 className="text-xl font-bold">Einstellungen</h1>
          </div>
          <Link href="/admin" className="text-sm font-medium hover:text-primary transition-colors">
            ← Zurück zum Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8 space-y-12">
        <section>
          <h2 className="text-2xl font-bold text-secondary border-l-4 border-primary pl-3 mb-6">
            Standard-Uhrzeiten
          </h2>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {timeFields.map(({ key, id, label }) => (
                <div key={id}>
                  <label htmlFor={id} className="block text-xs font-bold uppercase text-secondary/60 tracking-wider mb-1">
                    {label}
                  </label>
                  <input
                    id={id}
                    type="time"
                    value={timeDefaults[key]}
                    onChange={(e) => setTimeDefaults({ ...timeDefaults, [key]: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted mt-4">
              Diese Uhrzeiten werden beim Anlegen einer Veranstaltung als Beginn vorgeschlagen. Bereits
              angelegte Termine bleiben unverändert.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-secondary border-l-4 border-primary pl-3 mb-6">
            Schichtplan-Einstellungen
          </h2>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="cooldown-slider" className="text-xs font-bold uppercase text-secondary/60 tracking-wider">
                Abkühlphase
              </label>
              <span className="text-2xl font-black text-secondary">{cooldownDays} Tage</span>
            </div>
            <input
              id="cooldown-slider"
              type="range"
              min="0"
              max="60"
              step="1"
              value={cooldownDays}
              onChange={(e) => setCooldownDays(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary border border-black/5"
            />
            <div className="flex justify-between text-[10px] font-bold text-muted mt-1 px-1">
              <span>0 TAGE</span>
              <span>30 TAGE</span>
              <span>60 TAGE</span>
            </div>
            <p className="text-xs text-muted mt-2">
              Nach wie vielen Tagen darf ein Mitglied wieder für denselben oder einen wichtigen/Wochenend-Dienst eingeteilt werden? (0 = keine Abkühlphase)
            </p>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            onClick={saveSettings}
            disabled={isSaving}
            className="bg-secondary text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Speichert...
              </>
            ) : (
              'Speichern'
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
