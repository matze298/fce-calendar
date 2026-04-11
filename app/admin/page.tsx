'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import Image from 'next/image';

type Member = {
  id: string;
  name: string;
  email: string;
  seniority_level: string;
  historical_shifts: number;
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

  const fetchData = async () => {
    setLoading(true);
    
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

  useEffect(() => {
    fetchData();
  }, []);

  const generateSchedule = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate', { method: 'POST' });
      const result = await response.json();
      
      if (response.ok) {
        alert(`Erfolg: ${result.assignments_count} Schichten wurden als Entwurf geplant.`);
        await fetchData();
      } else {
        alert('Fehler bei der Generierung: ' + result.error);
      }
    } catch (err) {
      alert('Netzwerkfehler: Der Server ist nicht erreichbar.');
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
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-xl font-bold animate-pulse text-secondary">Lade Daten...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
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
        {/* Work Dates Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-secondary border-l-4 border-primary pl-3">
              Arbeitstage
            </h2>
            <span className="text-sm font-medium text-muted">{workDates.length} Termine</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workDates.map((wd) => {
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

                  {/* Assigned Members List */}
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
            })}
          </div>
        </section>

        {/* Members Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-secondary border-l-4 border-primary pl-3">
              Mitglieder
            </h2>
            <span className="text-sm font-medium text-muted">{members.length} Personen</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {members.map((m) => (
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
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
