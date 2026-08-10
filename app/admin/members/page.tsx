'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { checkAdminAccess } from '@/utils/adminGuard';
import { findMemberCandidates, type MatchSuggestion } from '@/utils/memberMatch';

type Member = {
  id: string;
  name: string;
  email: string;
  seniority_level: string;
  historical_shifts: number;
  is_approved: boolean;
  is_admin: boolean;
  auth_id: string | null;
  created_at: string;
  availability?: string;
  exempt?: boolean;
};

type Registration = {
  id: string;
  auth_id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
};

export default function ManageMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  // New Member Form State
  const [newMember, setNewMember] = useState({
    name: '',
    email: '',
    seniority_level: 'Standard',
    historical_shifts: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();

  useEffect(() => {
    const loadPage = async () => {
      const access = await checkAdminAccess();
      if (access === 'unauthenticated') {
        router.push('/login');
        return;
      }

      if (access === 'forbidden') {
        router.push('/admin');
        return;
      }

      const { members: loadedMembers, registrations: loadedRegistrations } =
        await fetchMembersAndRegistrations();

      setMembers(loadedMembers);
      setRegistrations(loadedRegistrations);
      setLoading(false);
    };

    loadPage();
  }, [router]);

  const approveMember = async (id: string) => {
    const { error } = await supabase
      .from('members')
      .update({ is_approved: true })
      .eq('id', id);

    if (error) alert(error.message);
    else setMembers(await fetchMembers());
  };

  const linkRegistration = async (
    registration: Registration,
    member: { id: string; name: string; auth_id: string | null },
  ) => {
    if (member.auth_id) {
      const confirmed = confirm(
        `${member.name} ist bereits mit einem Konto verknüpft. Wenn Sie fortfahren, verliert die ` +
          'bisher verknüpfte Person den Zugriff auf dieses Mitglied. Trotzdem verknüpfen?',
      );
      if (!confirmed) return;
    }

    const { error } = await supabase
      .from('members')
      .update({
        auth_id: registration.auth_id,
        email: registration.email,
        is_approved: true,
      })
      .eq('id', member.id);

    if (error) {
      alert('Verknüpfen fehlgeschlagen: ' + error.message);
      return;
    }

    const { error: deleteError } = await supabase.from('registrations').delete().eq('id', registration.id);

    if (deleteError) {
      alert('Mitglied wurde verknüpft, aber die Registrierung konnte nicht entfernt werden: ' + deleteError.message);
      return;
    }

    const { members: loadedMembers, registrations: loadedRegistrations } =
      await fetchMembersAndRegistrations();
    setMembers(loadedMembers);
    setRegistrations(loadedRegistrations);
  };

  const createMemberFromRegistration = async (registration: Registration) => {
    const { error } = await supabase.from('members').insert({
      auth_id: registration.auth_id,
      email: registration.email,
      name: `${registration.first_name} ${registration.last_name}`,
      is_approved: true,
      is_admin: false,
    });

    if (error) {
      alert('Anlegen fehlgeschlagen: ' + error.message);
      return;
    }

    const { error: deleteError } = await supabase.from('registrations').delete().eq('id', registration.id);

    if (deleteError) {
      alert('Mitglied wurde angelegt, aber die Registrierung konnte nicht entfernt werden: ' + deleteError.message);
      return;
    }

    const { members: loadedMembers, registrations: loadedRegistrations } =
      await fetchMembersAndRegistrations();
    setMembers(loadedMembers);
    setRegistrations(loadedRegistrations);
  };

  const rejectRegistration = async (registration: Registration) => {
    if (!confirm(`Registrierung von ${registration.first_name} ${registration.last_name} ablehnen?`)) {
      return;
    }

    const { error } = await supabase.from('registrations').delete().eq('id', registration.id);

    if (error) {
      alert('Ablehnen fehlgeschlagen: ' + error.message);
      return;
    }

    setRegistrations(await fetchRegistrations());
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.email || !newMember.name) return;

    setIsSubmitting(true);
    const { error } = await supabase
      .from('members')
      .insert({
        ...newMember,
        is_approved: true, // Admin-added members are auto-approved
        is_admin: false
      });

    if (error) {
      alert('Fehler beim Hinzufügen: ' + error.message);
    } else {
      setMembers(await fetchMembers());
      setNewMember({
        name: '',
        email: '',
        seniority_level: 'Standard',
        historical_shifts: 0
      });
    }
    setIsSubmitting(false);
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
      setMembers(await fetchMembers());
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

  if (loading) return <div className="p-8 text-center animate-pulse">Lade Mitglieder...</div>;

  const pendingMembers = members.filter(m => !m.is_approved);
  const approvedMembers = members.filter(m => m.is_approved);

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="bg-secondary text-white py-6 px-4 shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Image src="/fce-logo.png" alt="Logo" width={40} height={44} className="hover:opacity-80 transition-opacity cursor-pointer" />
            </Link>
            <h1 className="text-xl font-bold">Mitglieder-Management</h1>
          </div>
          <Link href="/admin" className="text-sm font-medium hover:text-primary transition-colors">
            ← Zurück zum Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add Member Form */}
          <section className="lg:col-span-1">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-24">
              <h2 className="text-lg font-bold text-secondary mb-4 uppercase tracking-wide border-b-2 border-primary pb-2">
                Mitglied hinzufügen
              </h2>
              <form onSubmit={handleAddMember} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-muted mb-1 uppercase">Name</label>
                  <input
                    type="text"
                    value={newMember.name}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                    placeholder="Vorname Nachname"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1 uppercase">Email</label>
                  <input
                    type="email"
                    value={newMember.email}
                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                    placeholder="email@fce.de"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1 uppercase">Status</label>
                  <select
                    value={newMember.seniority_level}
                    onChange={(e) => setNewMember({ ...newMember, seniority_level: e.target.value })}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="Senior">Senior</option>
                    <option value="Standard">Standard</option>
                    <option value="Junior">Junior</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted mb-1 uppercase">Bisherige Schichten</label>
                  <input
                    type="number"
                    min="0"
                    value={newMember.historical_shifts}
                    onChange={(e) => setNewMember({ ...newMember, historical_shifts: parseInt(e.target.value) || 0 })}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>
                <button
                  disabled={isSubmitting}
                  className="w-full bg-primary text-secondary font-bold py-3 rounded-xl shadow-md hover:opacity-90 transition-all disabled:opacity-50 mt-2"
                >
                  {isSubmitting ? 'Wird hinzugefügt...' : 'Mitglied anlegen'}
                </button>
              </form>
            </div>
          </section>

          {/* Pending & Approved Members List */}
          <div className="lg:col-span-2 space-y-12">
            {registrations.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-secondary border-l-4 border-primary pl-3 mb-6">
                  Ausstehende Registrierungen
                  <span className="ml-2 bg-secondary text-white text-[10px] px-2 py-0.5 rounded-full align-middle">
                    {registrations.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {registrations.map((registration) => {
                    const suggestions = findMemberCandidates(
                      {
                        firstName: registration.first_name,
                        lastName: registration.last_name,
                        email: registration.email,
                      },
                      members,
                    );

                    return (
                      <div
                        key={registration.id}
                        className="bg-white p-4 rounded-xl shadow-sm border border-gray-100"
                      >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <p className="font-bold text-secondary">
                              {registration.first_name} {registration.last_name}
                            </p>
                            <p className="text-xs text-muted">{registration.email}</p>
                            <p className="text-[10px] text-muted mt-1">
                              Registriert am {new Date(registration.created_at).toLocaleDateString('de-DE')}
                            </p>
                          </div>
                          <button
                            onClick={() => rejectRegistration(registration)}
                            className="text-xs font-bold text-red-600 hover:underline"
                          >
                            Ablehnen
                          </button>
                        </div>

                        {suggestions.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-[10px] uppercase font-bold text-muted">
                              Mögliche Zuordnung
                            </p>
                            {suggestions.map((suggestion) => (
                              <button
                                key={suggestion.member.id}
                                onClick={() => linkRegistration(registration, suggestion.member)}
                                className="w-full text-left p-2 rounded-lg border-2 border-gray-100 hover:border-primary transition-colors"
                              >
                                <span className="font-bold text-secondary text-sm">
                                  Mit {suggestion.member.name} verknüpfen
                                </span>
                                {suggestion.member.is_admin && (
                                  <span className="ml-2 text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded-full uppercase align-middle">
                                    Administrator
                                  </span>
                                )}
                                {suggestion.member.auth_id && (
                                  <span className="ml-2 text-[10px] font-bold text-white bg-secondary px-2 py-0.5 rounded-full uppercase align-middle">
                                    Bereits verknüpft
                                  </span>
                                )}
                                <span className="text-xs text-muted">
                                  {' '}
                                  · {suggestion.member.historical_shifts} Dienste ·{' '}
                                  {suggestion.member.email} · {suggestionLabel(suggestion)}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-muted italic">
                            Kein passender Eintrag gefunden.
                          </p>
                        )}

                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const target = e.target;
                              const memberId = target.value;
                              if (!memberId) return;

                              // Reset immediately so re-selecting the same member after a failed
                              // link still fires a change event instead of appearing dead.
                              target.value = '';

                              const member = members.find((candidate) => candidate.id === memberId);
                              if (member) linkRegistration(registration, member);
                            }}
                            className="flex-grow p-2 border rounded-lg text-sm"
                          >
                            <option value="">Manuell zuordnen…</option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.email})
                                {m.is_admin ? ' · Administrator' : ''}
                                {m.auth_id ? ' · bereits verknüpft' : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => createMemberFromRegistration(registration)}
                            className="bg-secondary text-white px-4 py-2 rounded-lg font-bold text-sm hover:opacity-90 transition-all"
                          >
                            Als neues Mitglied anlegen
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
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
                <div className="grid grid-cols-1 gap-4">
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
                <h2 className="text-2xl font-bold text-secondary border-l-4 border-primary pl-3 uppercase tracking-wide">
                  Alle Mitglieder
                </h2>
                <span className="text-sm font-medium text-muted">{approvedMembers.length} Personen</span>
              </div>

              <div className="space-y-3">
                {approvedMembers.length > 0 ? approvedMembers.map((m) => (
                  <div key={m.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between group">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-secondary">{m.name}</h3>
                        {m.auth_id && (
                          <span
                            title="Dieses Mitglied hat ein Konto und kann sich anmelden"
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap"
                          >
                            ✓ Registriert
                          </span>
                        )}
                        {m.is_admin && (
                          <span
                            title="Dieses Mitglied hat vollen Zugriff auf den Admin-Bereich"
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white whitespace-nowrap"
                          >
                            Administrator
                          </span>
                        )}
                      </div>
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
                  <div className="py-12 text-center bg-white rounded-xl border-2 border-dashed border-gray-100">
                    <p className="text-muted italic">Keine Mitglieder gefunden. Prüfen Sie Ihre Datenbankverbindung.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
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

/**
 * Pure reader, outside the component because it holds no state. Keeping it out of the component
 * also keeps it out of the reactive graph the mount effect depends on.
 */
async function fetchMembers(): Promise<Member[]> {
  const { data } = await supabase
    .from('members')
    .select('*')
    .order('name');

  return data ?? [];
}

async function fetchRegistrations(): Promise<Registration[]> {
  const { data } = await supabase
    .from('registrations')
    .select('*')
    .order('created_at', { ascending: true });

  return data ?? [];
}

/**
 * Both readers in one round trip. A plain module-level function rather than a component callback,
 * so the mount effect can call it without pulling a memoized closure into its dependency graph.
 */
async function fetchMembersAndRegistrations(): Promise<{
  members: Member[];
  registrations: Registration[];
}> {
  const [members, registrations] = await Promise.all([fetchMembers(), fetchRegistrations()]);
  return { members, registrations };
}

/** How a suggestion earned its place, for the admin deciding whether to trust it. */
function suggestionLabel(suggestion: MatchSuggestion): string {
  if (suggestion.reason === 'exact-email') return 'E-Mail identisch';
  if (suggestion.reason === 'exact-name') return 'Name identisch';
  return `ähnlich (${Math.round(suggestion.score * 100)}%)`;
}
