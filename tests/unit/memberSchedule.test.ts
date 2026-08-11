import { describe, expect, it, vi } from 'vitest';

import {
  findNextOwnDuty,
  groupScheduleRows,
  type ScheduleRow,
} from '@/utils/memberSchedule';

const TODAY = new Date(2026, 8, 15); // 15 September 2026, local time
const ME = 'me-1';

function row(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    workdate_id: 'wd-1',
    date: '2026-09-20',
    event_name: 'Heimspiel',
    start_time: '15:30:00',
    member_id: ME,
    member_name: 'Mem Ber',
    ...overrides,
  };
}

describe('groupScheduleRows', () => {
  it('collapses the rows for one date into a single day carrying every person', () => {
    // GIVEN two rows for the same work date
    const rows = [
      row(),
      row({ member_id: 'other-1', member_name: 'Kol Lege' }),
    ];

    // WHEN grouping
    const days = groupScheduleRows({ rows, viewerMemberId: ME, includePast: false, today: TODAY });

    // THEN there is one day, holding both people
    expect(days).toHaveLength(1);
    expect(days[0].people.map(p => p.name)).toEqual(['Kol Lege', 'Mem Ber']);
  });

  it('orders days by date and people by German collation within a day', () => {
    // GIVEN two dates supplied newest first, and names whose order differs between code point
    // and German collation
    const rows = [
      row({ workdate_id: 'wd-2', date: '2026-10-05', member_id: 'z', member_name: 'Zacharias Weber' }),
      row({ workdate_id: 'wd-2', date: '2026-10-05', member_id: 'o', member_name: 'Örtel Anna' }),
      row({ workdate_id: 'wd-1', date: '2026-09-20', member_id: 'a', member_name: 'Anton Bauer' }),
    ];
    const localeCompareSpy = vi.spyOn(String.prototype, 'localeCompare');

    // WHEN grouping
    const days = groupScheduleRows({ rows, viewerMemberId: ME, includePast: false, today: TODAY });

    // THEN days ascend and Ö sorts as a German reader expects rather than after Z
    expect(days.map(d => d.date)).toEqual(['2026-09-20', '2026-10-05']);
    expect(days[1].people.map(p => p.name)).toEqual(['Örtel Anna', 'Zacharias Weber']);

    // THEN German collation was requested explicitly. This machine's default locale orders these
    // particular names the same way, so the assertion above would pass with a bare localeCompare.
    expect(localeCompareSpy.mock.calls.some(call => call[1] === 'de')).toBe(true);
    localeCompareSpy.mockRestore();
  });

  it('treats a date falling on today as upcoming', () => {
    // GIVEN a row dated today, which is the boundary the filter turns on
    const rows = [row({ date: '2026-09-15' })];

    // WHEN grouping without past dates
    const days = groupScheduleRows({ rows, viewerMemberId: ME, includePast: false, today: TODAY });

    // THEN it is kept, because a duty this evening still belongs on the plan
    expect(days.map(d => d.date)).toEqual(['2026-09-15']);
  });

  it('excludes past dates by default and includes them on request', () => {
    // GIVEN one past and one upcoming date
    const rows = [
      row({ workdate_id: 'past', date: '2026-09-01' }),
      row({ workdate_id: 'soon', date: '2026-09-20' }),
    ];

    // WHEN grouping without past dates
    const upcoming = groupScheduleRows({ rows, viewerMemberId: ME, includePast: false, today: TODAY });

    // THEN only the upcoming one is present
    expect(upcoming.map(d => d.date)).toEqual(['2026-09-20']);

    // WHEN grouping with past dates
    const all = groupScheduleRows({ rows, viewerMemberId: ME, includePast: true, today: TODAY });

    // THEN both are present, oldest first
    expect(all.map(d => d.date)).toEqual(['2026-09-01', '2026-09-20']);
  });

  it('marks exactly the viewer among the people on a date', () => {
    // GIVEN the viewer and someone else on one date
    const rows = [row(), row({ member_id: 'other-1', member_name: 'Kol Lege' })];

    // WHEN grouping
    const days = groupScheduleRows({ rows, viewerMemberId: ME, includePast: false, today: TODAY });

    // THEN only the viewer's entry is flagged, so the page can emphasize it
    expect(days[0].people.find(p => p.name === 'Mem Ber')?.isMe).toBe(true);
    expect(days[0].people.find(p => p.name === 'Kol Lege')?.isMe).toBe(false);
  });

  it('carries a missing event name and start time through as null', () => {
    // GIVEN a date with neither a name nor a time, which is how an unnamed work date arrives
    const rows = [row({ event_name: null, start_time: null })];

    // WHEN grouping
    const days = groupScheduleRows({ rows, viewerMemberId: ME, includePast: false, today: TODAY });

    // THEN the fields stay null so the page chooses its own placeholder
    expect(days[0].eventName).toBeNull();
    expect(days[0].startTime).toBeNull();
  });

  it('trims the PostgREST time to what a reader needs', () => {
    // GIVEN a start time in PostgREST's seconds-bearing format
    const rows = [row({ start_time: '20:00:00' })];

    // WHEN grouping
    const days = groupScheduleRows({ rows, viewerMemberId: ME, includePast: false, today: TODAY });

    // THEN it is trimmed for display
    expect(days[0].startTime).toBe('20:00');
  });

  it('returns an empty list for no rows rather than throwing', () => {
    // GIVEN nothing at all
    // WHEN grouping
    const days = groupScheduleRows({ rows: [], viewerMemberId: ME, includePast: true, today: TODAY });

    // THEN the caller gets an empty list
    expect(days).toEqual([]);
  });
});

describe('findNextOwnDuty', () => {
  it('returns the earliest own duty on or after today', () => {
    // GIVEN two upcoming days, only the later of which the viewer works
    const rows = [
      row({ workdate_id: 'wd-1', date: '2026-09-20', member_id: 'other-1', member_name: 'Kol Lege' }),
      row({ workdate_id: 'wd-2', date: '2026-10-05' }),
    ];
    const days = groupScheduleRows({ rows, viewerMemberId: ME, includePast: false, today: TODAY });

    // WHEN looking for their next duty
    const next = findNextOwnDuty(days, TODAY);

    // THEN it is the day they actually work, not merely the next day on the plan
    expect(next?.date).toBe('2026-10-05');
  });

  it('ignores a past own duty even when the list includes past dates', () => {
    // GIVEN the viewer worked a past date and works nothing upcoming
    const rows = [row({ workdate_id: 'past', date: '2026-09-01' })];
    const days = groupScheduleRows({ rows, viewerMemberId: ME, includePast: true, today: TODAY });

    // WHEN looking for their next duty
    // THEN there is none, because a duty already worked is not the next one
    expect(findNextOwnDuty(days, TODAY)).toBeNull();
  });

  it('returns null when the viewer works nothing at all', () => {
    // GIVEN a plan the viewer does not appear on
    const rows = [row({ member_id: 'other-1', member_name: 'Kol Lege' })];
    const days = groupScheduleRows({ rows, viewerMemberId: ME, includePast: false, today: TODAY });

    // WHEN looking for their next duty
    // THEN there is none
    expect(findNextOwnDuty(days, TODAY)).toBeNull();
  });
});
