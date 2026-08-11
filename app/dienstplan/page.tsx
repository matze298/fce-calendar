'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { SignOutButton } from '@/app/components/SignOutButton';
import { checkMemberAccess } from '@/utils/memberGuard';
import { parseIsoDate } from '@/utils/startTime';
import {
  findNextOwnDuty,
  groupScheduleRows,
  type ScheduleDay,
  type ScheduleRow,
} from '@/utils/memberSchedule';
import { supabase } from '@/utils/supabase';

export default function DutyPlanPage() {
  const [state, setState] = useState<'loading' | 'pending' | 'ok'>('loading');
  const [isAdmin, setIsAdmin] = useState(false);
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [nextDuty, setNextDuty] = useState<ScheduleDay | null>(null);
  const [includePast, setIncludePast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Two rapid toggles put two loads in flight. Without this, the later-resolving one wins
    // even when it was the earlier-toggled one, so the checkbox and the list could disagree.
    let ignore = false;

    const loadPage = async () => {
      const access = await checkMemberAccess();
      if (ignore) return;

      if (access.state === 'unauthenticated') {
        router.push('/login');
        return;
      }

      if (access.state === 'pending') {
        setState('pending');
        return;
      }

      setIsAdmin(access.isAdmin);

      // One clock reading for both the query window and the grouping, so the filter and the list
      // cannot straddle midnight and disagree.
      const today = new Date();
      const { data, error: queryError } = await fetchScheduleRows(includePast, today);
      if (ignore) return;

      if (queryError) {
        setError(queryError.message);
        setDays([]);
        setNextDuty(null);
        setState('ok');
        return;
      }

      setError(null);
      const grouped = groupScheduleRows({
        rows: (data ?? []) as ScheduleRow[],
        viewerMemberId: access.member.id,
        includePast,
        today,
      });
      setDays(grouped);
      // Derived here rather than during render, so it uses the same clock reading as the query window
      // and the grouping above.
      setNextDuty(findNextOwnDuty(grouped, today));
      setState('ok');
    };

    loadPage();

    return () => {
      ignore = true;
    };
  }, [includePast, router]);

  if (state === 'loading') {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background gap-4">
        <div className="text-xl font-bold animate-pulse text-secondary text-center">
          Wird geladen...
        </div>
      </div>
    );
  }

  if (state === 'pending') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md">
          <h2 className="text-2xl font-bold text-secondary mb-4">Registrierung in Prüfung</h2>
          <p className="text-muted mb-8">
            Ihre Registrierung wird noch geprüft. Ein Administrator ordnet Sie in Kürze Ihrem
            Mitgliedseintrag zu.
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-secondary text-white py-3 rounded-lg font-bold"
          >
            Zurück zur Startseite
          </button>
          <div className="mt-4 flex justify-center">
            <SignOutButton variant="card" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="bg-secondary text-white py-6 px-4 shadow-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/fce-logo.png" alt="Logo" width={40} height={44} />
            <h1 className="text-xl font-bold">Dienstplan</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                href="/admin"
                className="bg-white/10 text-white border border-white/20 px-4 py-2 rounded-lg font-bold text-sm hover:bg-white/20 transition-all"
              >
                Admin-Bereich
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8 flex flex-col gap-6">
        <section className="bg-white p-6 rounded-2xl shadow-xl">
          <p className="text-secondary font-bold">
            {nextDuty
              ? `Ihr nächster Dienst: ${formatLongDate(nextDuty.date)}`
              : 'Für Sie ist derzeit kein Dienst eingeteilt.'}
          </p>
          <label className="mt-4 flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={includePast}
              onChange={event => setIncludePast(event.target.checked)}
            />
            Vergangene Termine einschließen
          </label>
        </section>

        {error && (
          <p className="bg-white p-6 rounded-2xl shadow-xl text-secondary">
            Der Dienstplan konnte nicht geladen werden: {error}
          </p>
        )}

        {!error && days.length === 0 && (
          <p className="bg-white p-6 rounded-2xl shadow-xl text-muted">
            Es ist noch kein Dienstplan veröffentlicht.
          </p>
        )}

        {days.map(day => (
          <article key={day.workdateId} className="bg-white p-6 rounded-2xl shadow-xl">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-secondary">{formatLongDate(day.date)}</h2>
              <p className="text-sm text-muted">
                {day.startTime ?? 'Zeit offen'}
                {day.eventName ? ` · ${day.eventName}` : ''}
              </p>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {day.people.map(person => (
                <li
                  key={person.memberId}
                  data-testid={`person-${person.memberId}`}
                  data-me={String(person.isMe)}
                  className={
                    person.isMe
                      ? 'bg-primary text-secondary font-bold px-3 py-1 rounded-lg text-sm'
                      : 'bg-background text-secondary px-3 py-1 rounded-lg text-sm'
                  }
                >
                  {person.name}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </main>
    </div>
  );
}

/** The published plan, restricted to the current or future window unless past dates are wanted. */
function fetchScheduleRows(includePast: boolean, today: Date) {
  let query = supabase.from('published_schedule').select('*');
  if (!includePast) {
    query = query.gte('date', toIsoDate(today));
  }
  return query;
}

/** Local calendar date, because toISOString would roll over late in the evening. */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatLongDate(isoDate: string): string {
  return parseIsoDate(isoDate).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
