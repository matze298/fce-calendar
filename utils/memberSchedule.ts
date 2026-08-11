import { parseIsoDate, toTimeInputValue } from '@/utils/startTime';

export type ScheduleRow = {
  workdate_id: string;
  date: string;
  event_name: string | null;
  start_time: string | null;
  member_id: string;
  member_name: string;
};

export type SchedulePerson = { memberId: string; name: string; isMe: boolean };

export type ScheduleDay = {
  workdateId: string;
  date: string;
  eventName: string | null;
  startTime: string | null;
  people: SchedulePerson[];
};

/**
 * The published plan as one entry per date, each carrying everyone working it.
 *
 * `today` is a parameter rather than read from the clock, so the result is a function of its input
 * alone and a test can pin the boundary.
 */
export function groupScheduleRows({
  rows,
  viewerMemberId,
  includePast,
  today,
}: {
  rows: ScheduleRow[];
  viewerMemberId: string;
  includePast: boolean;
  today: Date;
}): ScheduleDay[] {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const byWorkDate = new Map<string, ScheduleDay>();

  for (const row of rows) {
    if (!includePast && parseIsoDate(row.date) < startOfToday) continue;

    const day = byWorkDate.get(row.workdate_id) ?? {
      workdateId: row.workdate_id,
      date: row.date,
      eventName: row.event_name,
      startTime: toTimeInputValue(row.start_time) || null,
      people: [],
    };

    day.people.push({
      memberId: row.member_id,
      name: row.member_name,
      isMe: row.member_id === viewerMemberId,
    });

    byWorkDate.set(row.workdate_id, day);
  }

  const days = [...byWorkDate.values()];
  for (const day of days) {
    day.people.sort((left, right) => left.name.localeCompare(right.name, 'de'));
  }

  return days.sort((left, right) => left.date.localeCompare(right.date));
}

/** The viewer's next duty on or after today, or null when they have none. */
export function findNextOwnDuty(days: ScheduleDay[], today: Date): ScheduleDay | null {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    days.find(day => day.people.some(person => person.isMe) && parseIsoDate(day.date) >= startOfToday) ??
    null
  );
}
