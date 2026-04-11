'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

type Member = {
  id: string;
  name: string;
  email: string;
  seniority_level: string;
  historical_shifts: number;
  is_approved: boolean;
  is_admin: boolean;
  created_at: string;
};

type WorkDate = {
  id: string;
  date: string;
  required_people: number;
  is_important_shift: boolean;
  is_weekend: boolean;
};

type Assignment = {
  id: string;
  workdate_id: string;
  member_id: string;
  members: { name: string };
};

export default function AdminDashboard() {
  const [members, setMembers] = useState<Member[]>([]);
  const [workDates, setWorkDates] = useState<WorkDate[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  const fetchData = async () => {
    setLoading(true);
    
    // Check Auth Status & Permissions
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
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    const { data: membersData } = await supabase
      .from('members')
      .select('*')
      .order('name');
    
    const { data: datesData } = await supabase
      .from('work_dates')
      .select('*')
      .order('date');

    const { data: assignData } = await supabase
      .from('assignments')
      .select('*, members(name)')
      .eq('status', 'Draft');

    if (membersData) setMembers(membersData);
    if (datesData) setWorkDates(datesData);
    if (assignData) setAssignments(assignData as any);
    setLoading(false);
  };

  const approveMember = async (id: string) => {
    const { error } = await supabase
      .from('members')
      .update({ is_approved: true })
      .eq('id', id);
    
    if (error) alert(error.message);
    else fetchData();
  };

  useEffect(() => {
    fetchData();
  }, []);

  const generateSchedule = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        result = { error: `Server antwortete mit: ${text.substring(0, 100)}...` };
      }
      
      if (response.ok) {
        alert(`Erfolg: ${result.assignments_count} Schichten wurden als Entwurf geplant.`);
        await fetchData();
      } else {
        alert(`API-Fehler (${response.status}): ${result.error || 'Unbekannter Fehler'}`);
      }
    } catch (err: any) {
      alert(`Verbindungsfehler: ${err.message || 'Der Server ist nicht erreichbar'}. Stellen Sie sicher, dass 'npx vercel dev' läuft.`);
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteMember = async (id: string, name: string) => {
    if (!confirm(`Möchten Sie ${name} wirklich unwiderruflich löschen? Alle zugehörigen Schichtdaten werden gemäß DSGVO ebenfalls gelöscht.`)) {
      return;
    }

    const { error } = await supabase
      .from('members')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Fehler beim Löschen: ' + error.message);
    } else {
      setMembers(members.filter(m => m.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background gap-4">
        <div className="text-xl font-bold animate-pulse text-secondary text-center">
          Wird geprüft...
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md">
          <h2 className="text-2xl font-bold text-secondary mb-4">Zugriff verweigert</h2>
          <p className="text-muted mb-8">
            Ihr Konto ist noch nicht für den Admin-Bereich freigeschaltet. 
            Bitte kontaktieren Sie einen Administrator zur Freigabe.
          </p>
          <button 
            onClick={() => router.push('/')}
            className="w-full bg-secondary text-white py-3 rounded-lg font-bold"
          >
            Zurück zur Startseite
          </button>
        </div>
      </div>
    );
  }

  const pendingMembers = members.filter(m => !m.is_approved);
  const approvedMembers = members.filter(m => m.is_approved);

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="bg-secondary text-white py-6 px-4 shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/fce-logo.png" alt="Logo" width={40} height={40} />
            <h1 className="text-xl font-bold">Admin-Bereich</h1>
          </div>
          <button 
            className="bg-primary text-secondary px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
            onClick={generateSchedule}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-secondary border-t-transparent rounded-full animate-spin"></div>
                Planung läuft...
              </>
            ) : (
              'Planung generieren'
            )}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8 space-y-12">
        {pendingMembers.length > 0 && (
          <section className="bg-primary/10 p-6 rounded-2xl border-2 border-primary border-dashed">
            <h2 className="text-xl font-bold text-secondary mb-4 flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-secondary"></span>
              </span>
              Ausstehende Freischaltungen
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingMembers.map((m) => (
                <div key={m.id} className="bg-white p-4 rounded-xl shadow-sm flex items-center justify-between border border-primary/30">
                  <div>
                    <p className="font-bold text-secondary">{m.email}</p>
                    <p className="text-[10px] text-muted">Registriert am: {new Date(m.created_at).toLocaleDateString()}</p>
                  </div>
                  <button 
                    onClick={() => approveMember(m.id)}
                    className="bg-secondary text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-black transition-colors"
                  >
                    Freischalten
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-secondary border-l-4 border-primary pl-3">
              Arbeitstage
            </h2>
            <span className="text-sm font-medium text-muted">{workDates.length} Termine</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workDates.length > 0 ? workDates.map((wd) => {
              const currentAssignments = assignments.filter(a => a.workdate_id === wd.id);
              return (
                <div 
                  key={wd.id} 
                  className={`p-5 rounded-xl border-2 transition-all shadow-sm bg-white ${
                    wd.is_important_shift 
                      ? 'border-primary ring-1 ring-primary/20' 
                      : 'border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-lg font-bold text-secondary">
                      {new Date(wd.date).toLocaleDateString('de-DE', { 
                        weekday: 'short', 
                        day: '2-digit', 
                        month: '2-digit' 
                      })}
                    </span>
                    {wd.is_important_shift && (
                      <span className="bg-primary text-secondary text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                        Wichtig
                      </span>
                    )}
                  </div>
                  
                  <div className="text-muted text-xs mb-4 flex items-center justify-between">
                    <span>Bedarf: {wd.required_people} {wd.required_people === 1 ? 'Person' : 'Personen'}</span>
                    <span className={currentAssignments.length >= wd.required_people ? 'text-green-600 font-bold' : 'text-orange-500 font-bold'}>
                      {currentAssignments.length}/{wd.required_people} Besetzt
                    </span>
                  </div>

                  <div className="space-y-2 mt-4 pt-4 border-t border-gray-50">
                    {currentAssignments.length > 0 ? (
                      currentAssignments.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 text-sm text-secondary font-medium">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                          {a.members.name}
                        </div>
                      ))
                    ) : (
                      <p className="text-xs italic text-muted">Noch keine Zuweisungen</p>
                    )}
                  </div>
                </div>
              );
            }) : (
              <div className="col-span-full py-12 text-center bg-white rounded-xl border-2 border-dashed border-gray-100">
                <p className="text-muted italic">Keine Arbeitstage gefunden. Führen Sie das Setup-Script in Supabase aus.</p>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-secondary border-l-4 border-primary pl-3">
              Mitglieder
            </h2>
            <span className="text-sm font-medium text-muted">{members.length} Personen</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {approvedMembers.length > 0 ? approvedMembers.map((m) => (
              <div key={m.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between group">
                <div>
                  <h3 className="font-bold text-secondary">{m.name}</h3>
                  <p className="text-xs text-muted">{m.email}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                      m.seniority_level === 'Senior' ? 'bg-secondary text-white' : 'bg-gray-100 text-muted'
                    }`}>
                      {m.seniority_level}
                    </span>
                    <p className="text-[10px] text-muted mt-2">Dienste: {m.historical_shifts}</p>
                  </div>
                  <button 
                    onClick={() => deleteMember(m.id, m.name)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Mitglied gemäß DSGVO löschen"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-12 text-center bg-white rounded-xl border-2 border-dashed border-gray-100">
                <p className="text-muted italic">Keine Mitglieder gefunden. Prüfen Sie Ihre Datenbankverbindung.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
