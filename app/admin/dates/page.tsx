'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { defaultStartTimeFor, isWeekendDate, START_TIME_FALLBACKS, StartTimeDefaults, toTimeInputValue } from '@/utils/startTime';

type WorkDate = {
  id: string;
  date: string;
  name: string | null;
  start_time: string | null;
  required_people: number;
  is_important_shift: boolean;
  is_weekend: boolean;
};

export default function ManageDatesPage() {
  const [workDates, setWorkDates] = useState<WorkDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Form State
  const [selectedDate, setSelectedDate] = useState('');
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [startTimeTouched, setStartTimeTouched] = useState(false);
  const [requiredPeople, setRequiredPeople] = useState(1);
  const [isImportant, setIsImportant] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeDefaults, setTimeDefaults] = useState<StartTimeDefaults>(START_TIME_FALLBACKS);

  const router = useRouter();

  const fetchDates = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('members')
      .select('is_admin, is_approved')
      .eq('auth_id', user.id)
      .single();

    if (!profile || !profile.is_admin || !profile.is_approved) {
      router.push('/admin'); // Redirect back if not authorized
      return;
    }

    setIsAdmin(true);

    const { data } = await supabase
      .from('work_dates')
      .select('*')
      .order('date', { ascending: true });

    if (data) setWorkDates(data);

    const { data: settingsData } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .single();

    if (settingsData) setTimeDefaults(settingsData);

    setLoading(false);
  };

  useEffect(() => {
    fetchDates();
  }, []);

  const resetForm = () => {
    setSelectedDate('');
    setName('');
    setStartTime('');
    setStartTimeTouched(false);
    setRequiredPeople(1);
    setIsImportant(false);
  };

  const loadForm = (wd: WorkDate) => {
    setSelectedDate(wd.date);
    setName(wd.name ?? '');
    setStartTime(toTimeInputValue(wd.start_time));
    setStartTimeTouched(true);
    setRequiredPeople(wd.required_people);
    setIsImportant(wd.is_important_shift);
  };

  const handleDateChange = (date: string) => {
    const existing = workDates.find(wd => wd.date === date);
    if (existing) {
      loadForm(existing);
      return;
    }

    setSelectedDate(date);
    if (date && !startTimeTouched) setStartTime(defaultStartTimeFor(date, timeDefaults));
  };

  const handleSaveDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) return;

    setIsSubmitting(true);

    const { error } = await supabase
      .from('work_dates')
      .upsert({
        date: selectedDate,
        name: name.trim() || null,
        start_time: startTime || null,
        required_people: requiredPeople,
        is_important_shift: isImportant,
        is_weekend: isWeekendDate(selectedDate)
      }, { onConflict: 'date' });

    if (error) {
      alert('Fehler beim Speichern: ' + error.message);
    } else {
      await fetchDates();
      resetForm();
    }
    setIsSubmitting(false);
  };

  const removeDate = async (id: string) => {
    if (!confirm('Diesen Termin wirklich entfernen? Existierende Schichtzuweisungen werden ebenfalls gelöscht.')) return;

    const { error } = await supabase
      .from('work_dates')
      .delete()
      .eq('id', id);

    if (error) alert(error.message);
    else fetchDates();
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Lade Kalender...</div>;

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="bg-secondary text-white py-6 px-4 shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Image src="/fce-logo.png" alt="Logo" width={40} height={40} className="hover:opacity-80 transition-opacity cursor-pointer" />
            </Link>
            <h1 className="text-xl font-bold">Termin-Management</h1>
          </div>
          <Link href="/admin" className="text-sm font-medium hover:text-primary transition-colors">
            ← Zurück zum Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Add/Edit Form */}
          <section className="lg:col-span-1">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-24">
              <h2 className="text-lg font-bold text-secondary mb-4 uppercase tracking-wide border-b-2 border-primary pb-2">
                {workDates.some(d => d.date === selectedDate) ? 'Termin bearbeiten' : 'Termin hinzufügen'}
              </h2>
              <form onSubmit={handleSaveDate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">DATUM</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">NAME (OPTIONAL)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="z. B. Heimspiel gegen TSV Musterdorf"
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">BEGINN</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      setStartTimeTouched(true);
                    }}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  />
                  <p className="text-[10px] text-muted mt-1">
                    Vorbelegt aus den Standardzeiten. Leeren, wenn keine Uhrzeit angezeigt werden soll.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1">PERSONEN-BEDARF</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={requiredPeople}
                    onChange={(e) => setRequiredPeople(parseInt(e.target.value))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
                <div className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    id="important"
                    checked={isImportant}
                    onChange={(e) => setIsImportant(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <label htmlFor="important" className="text-sm font-bold text-secondary">Wichtiger Dienst (Senior-Priorität)</label>
                </div>
                <div className="flex gap-2">
                  {selectedDate && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="flex-1 border-2 border-gray-100 text-secondary font-bold py-3 rounded-xl hover:bg-gray-50 transition-all"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    disabled={isSubmitting}
                    className="flex-[2] bg-primary text-secondary font-bold py-3 rounded-xl shadow-md hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Speichert...' : workDates.some(d => d.date === selectedDate) ? 'Aktualisieren' : 'Termin festlegen'}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* List of active dates */}
          <section className="lg:col-span-2">
            <h2 className="text-lg font-bold text-secondary mb-6 uppercase tracking-wide flex items-center gap-2">
              Aktive Schichttage
              <span className="bg-secondary text-white text-[10px] px-2 py-0.5 rounded-full">{workDates.length}</span>
            </h2>
            <div className="space-y-3">
              {workDates.length > 0 ? workDates.map((wd) => (
                <div key={wd.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center text-white ${wd.is_important_shift ? 'bg-primary text-secondary font-black' : 'bg-secondary'}`}>
                      <span className="text-[10px] uppercase">{new Date(wd.date).toLocaleDateString('de-DE', { weekday: 'short' })}</span>
                      <span className="text-sm font-bold">{new Date(wd.date).getDate()}</span>
                    </div>
                    <div>
                      <p className="font-bold text-secondary">
                        {wd.name ?? new Date(wd.date).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-muted">
                        {wd.name && `${new Date(wd.date).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })} · `}
                        Bedarf: {wd.required_people} Personen
                        {wd.start_time && ` · Beginn: ${toTimeInputValue(wd.start_time)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {wd.is_important_shift && (
                      <span className="bg-primary/20 text-secondary text-[8px] font-bold px-2 py-1 rounded border border-primary/50 uppercase">Wichtig</span>
                    )}
                    <button
                      onClick={() => {
                        loadForm(wd);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="p-2 text-gray-300 hover:text-secondary hover:bg-gray-50 rounded-lg transition-all"
                      title="Termin bearbeiten"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button
                      onClick={() => removeDate(wd.id)}
                      className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      title="Termin löschen"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              )) : (
                <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-gray-100">
                  <p className="text-muted italic">Keine Termine geplant. Wählen Sie ein Datum aus.</p>
                </div>
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
