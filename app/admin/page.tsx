'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

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
  status: 'Draft' | 'Published';
  members: { name: string };
};

export default function AdminDashboard() {
  const [members, setMembers] = useState<Member[]>([]);
  const [workDates, setWorkDates] = useState<WorkDate[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [addingToDate, setAddingToDate] = useState<string | null>(null);
  const router = useRouter();

  const [editingMember, setEditingMember] = useState<Member | null>(null);

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
      .select('*, members(name)');

    if (membersData) setMembers(membersData);
    if (datesData) setWorkDates(datesData);
    if (assignData) setAssignments(assignData as any);
    setLoading(false);
  };

  const addAssignment = async (workdateId: string, memberId: string) => {
    if (!memberId) return;
    const hasDrafts = assignments.some(a => a.status === 'Draft');
    const { error } = await supabase
      .from('assignments')
      .insert({
        workdate_id: workdateId,
        member_id: memberId,
        status: hasDrafts ? 'Draft' : 'Published'
      });

    if (error) {
      if (error.code === '23505') {
        alert('Dieses Mitglied ist an diesem Tag bereits eingeteilt.');
      } else {
        alert('Fehler beim Zuweisen: ' + error.message);
      }
    } else {
      setAddingToDate(null);
      fetchData();
    }
  };

  const removeAssignment = async (id: string) => {
    if (!confirm('Zuweisung wirklich löschen?')) return;
    const { error } = await supabase
      .from('assignments')
      .delete()
      .eq('id', id);

    if (error) alert(error.message);
    else fetchData();
  };

  const savePlan = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ status: 'Published' })
        .eq('status', 'Draft');

      if (error) throw error;
      alert('Plan wurde erfolgreich gespeichert.');
      await fetchData();
    } catch (err: any) {
      alert('Fehler beim Speichern: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const cancelPlan = async () => {
    if (!confirm('Möchten Sie den aktuellen Entwurf wirklich verwerfen?')) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('status', 'Draft');

      if (error) throw error;
      await fetchData();
    } catch (err: any) {
      alert('Fehler beim Verwerfen: ' + err.message);
    } finally {
      setIsCancelling(false);
    }
  };

  const saveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    const { error } = await supabase
      .from('members')
      .update({
        name: editingMember.name,
        email: editingMember.email,
        seniority_level: editingMember.seniority_level,
        availability: editingMember.availability,
        historical_shifts: editingMember.historical_shifts,
        exempt: editingMember.exempt
      })
      .eq('id', editingMember.id);

    if (error) {
      alert('Fehler beim Speichern: ' + error.message);
    } else {
      setEditingMember(null);
      fetchData();
    }
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
            <Image
              src="/fce-logo.png"
              alt="Logo"
              width={40}
              height={40}
              style={{ width: '40px', height: 'auto' }}
            />
            <h1 className="text-xl font-bold">Admin-Bereich</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/dates"
              className="bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg font-bold text-sm hover:bg-white/20 transition-all flex items-center gap-2"
            >
              Termine verwalten
            </Link>
            {assignments.some(a => a.status === 'Draft') ? (
              <div className="flex items-center gap-2 bg-black/20 p-1 rounded-xl border border-white/10">
                <button
                  className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-red-600 transition-all disabled:opacity-50"
                  onClick={cancelPlan}
                  disabled={isCancelling || isSaving}
                >
                  {isCancelling ? 'Verwirft...' : 'Verwerfen'}
                </button>
                <button
                  className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-700 transition-all disabled:opacity-50"
                  onClick={savePlan}
                  disabled={isSaving || isCancelling}
                >
                  {isSaving ? 'Speichert...' : 'Speichern'}
                </button>
                <div className="w-px h-6 bg-white/20 mx-1"></div>
                <button
                  className="bg-primary text-secondary px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50"
                  onClick={generateSchedule}
                  disabled={isGenerating || isSaving || isCancelling}
                >
                  {isGenerating ? '...' : 'Neu generieren'}
                </button>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8 space-y-12">
        {assignments.some(a => a.status === 'Draft') && (
          <div className="bg-primary/20 border-2 border-primary border-dashed p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3 text-secondary">
              <div className="bg-primary p-2 rounded-full animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </div>
              <div>
                <p className="font-black text-sm uppercase tracking-tight">Vorschau-Modus</p>
                <p className="text-xs opacity-80 font-medium">Der aktuelle Plan ist noch ein Entwurf. Speichern Sie ihn, um ihn zu veröffentlichen.</p>
              </div>
            </div>
            <div className="flex gap-2">
               <button onClick={cancelPlan} className="text-xs font-bold px-3 py-1.5 hover:bg-black/5 rounded-lg transition-colors">Entwurf löschen</button>
               <button onClick={savePlan} className="bg-secondary text-white text-xs font-bold px-4 py-1.5 rounded-lg shadow-sm">Jetzt speichern</button>
            </div>
          </div>
        )}

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
                    <div className="flex items-center gap-2">
                      {wd.is_important_shift && (
                        <span className="bg-primary text-secondary text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                          Wichtig
                        </span>
                      )}
                      <button
                        onClick={() => setAddingToDate(addingToDate === wd.id ? null : wd.id)}
                        className={`p-1 rounded-md transition-colors ${addingToDate === wd.id ? 'bg-secondary text-white' : 'text-secondary hover:bg-gray-100'}`}
                        title="Mitglied manuell hinzufügen"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                      </button>
                    </div>
                  </div>

                  {addingToDate === wd.id && (
                    <div className="mb-4 p-2 bg-gray-50 rounded-lg border border-gray-100 animate-in fade-in slide-in-from-top-1">
                      <select
                        onChange={(e) => addAssignment(wd.id, e.target.value)}
                        className="w-full text-xs p-1.5 border rounded bg-white outline-none focus:ring-1 focus:ring-primary"
                        defaultValue=""
                      >
                        <option value="" disabled>Mitglied auswählen...</option>
                        {members
                          .filter(m => !currentAssignments.some(a => a.member_id === m.id))
                          .map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))
                        }
                      </select>
                    </div>
                  )}

                  <div className="text-muted text-xs mb-4 flex items-center justify-between">
                    <span>Bedarf: {wd.required_people} {wd.required_people === 1 ? 'Person' : 'Personen'}</span>
                    <span className={currentAssignments.length >= wd.required_people ? 'text-green-600 font-bold' : 'text-orange-500 font-bold'}>
                      {currentAssignments.length}/{wd.required_people} Besetzt
                    </span>
                  </div>

                  <div className="space-y-2 mt-4 pt-4 border-t border-gray-50">
                    {currentAssignments.length > 0 ? (
                      currentAssignments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-sm text-secondary font-medium group/assign">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${a.status === 'Draft' ? 'bg-primary animate-pulse' : 'bg-green-500'}`}></div>
                            {a.members.name}
                          </div>
                          <div className="flex items-center gap-2">
                            {a.status === 'Draft' && (
                              <span className="text-[9px] bg-primary/20 text-secondary px-1.5 py-0.5 rounded font-bold">Draft</span>
                            )}
                            <button
                              onClick={() => removeAssignment(a.id)}
                              className="opacity-0 group-hover/assign:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all"
                              title="Zuweisung entfernen"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                          </div>
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
                <div className="flex items-center gap-2 text-muted">
                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                      m.seniority_level === 'Senior' ? 'bg-secondary text-white' : 'bg-gray-100 text-muted'
                    }`}>
                      {m.seniority_level}
                    </span>
                    <p className="text-[10px] text-muted mt-2">Dienste: {m.historical_shifts}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingMember(m)}
                      className="p-2 text-secondary hover:bg-gray-50 rounded-lg transition-colors"
                      title="Mitglied bearbeiten"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button
                      onClick={() => deleteMember(m.id, m.name)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Mitglied gemäß DSGVO löschen"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  </div>
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

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 bg-secondary/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-secondary p-6 text-white flex justify-between items-center">
              <h2 className="text-xl font-bold">Mitglied bearbeiten</h2>
              <button onClick={() => setEditingMember(null)} className="hover:text-primary transition-colors text-2xl">&times;</button>
            </div>

            <form onSubmit={saveMember} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-muted mb-1 uppercase">Name</label>
                  <input
                    type="text"
                    value={editingMember.name}
                    onChange={e => setEditingMember({...editingMember, name: e.target.value})}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-muted mb-1 uppercase">Email</label>
                  <input
                    type="email"
                    value={editingMember.email}
                    onChange={e => setEditingMember({...editingMember, email: e.target.value})}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1 uppercase">Status</label>
                  <select
                    value={editingMember.seniority_level}
                    onChange={e => setEditingMember({...editingMember, seniority_level: e.target.value})}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="Senior">Senior</option>
                    <option value="Standard">Standard</option>
                    <option value="Junior">Junior</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1 uppercase">Verfügbarkeit</label>
                  <select
                    value={editingMember.availability}
                    onChange={e => setEditingMember({...editingMember, availability: e.target.value})}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="Any">Immer</option>
                    <option value="Weekends">Wochenende</option>
                    <option value="Weekdays">Wochentage</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1 uppercase">Bisherige Schichten</label>
                <input
                  type="number"
                  value={editingMember.historical_shifts}
                  onChange={e => setEditingMember({...editingMember, historical_shifts: parseInt(e.target.value)})}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="exempt"
                  checked={editingMember.exempt}
                  onChange={e => setEditingMember({...editingMember, exempt: e.target.checked})}
                  className="w-4 h-4 accent-primary"
                />
                <label htmlFor="exempt" className="text-sm font-bold text-secondary">Vom Dienst befreit (Exempt)</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="flex-1 px-4 py-3 border-2 border-gray-100 rounded-xl font-bold text-secondary hover:bg-gray-50 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-primary text-secondary rounded-xl font-black shadow-md hover:opacity-90 transition-all"
                >
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
