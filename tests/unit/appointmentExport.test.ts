import { describe, expect, it, vi } from 'vitest';

import {
  buildAppointmentExport,
  type ExportAssignmentInput,
  type ExportWorkDateInput,
} from '@/utils/appointmentExport';

const TODAY = new Date(2026, 8, 15); // 15 September 2026, local time

function workDate(id: string, date: string, overrides: Partial<ExportWorkDateInput> = {}): ExportWorkDateInput {
  return {
    id,
    date,
    name: null,
    start_time: '20:00:00',
    required_people: 2,
    ...overrides,
  };
}

function assignment(
  workdateId: string,
  memberId: string,
  name: string,
  status: 'Draft' | 'Published' = 'Published',
): ExportAssignmentInput {
  return { workdate_id: workdateId, member_id: memberId, status, members: { name } };
}

describe('buildAppointmentExport appointments', () => {
  it('leaves out draft assignments entirely', () => {
    // GIVEN one upcoming date with a published and a draft assignment on it
    const workDates = [workDate('1', '2026-09-20')];
    const assignments = [
      assignment('1', 'm1', 'Anna Fischer'),
      assignment('1', 'm2', 'Thomas Müller', 'Draft'),
    ];

    // WHEN building the export
    const result = buildAppointmentExport({ workDates, assignments, includePast: false, today: TODAY });

    // THEN only the published person is listed, so nobody is told they work an unpublished shift
    expect(result.appointments[0].assignedNames).toEqual(['Anna Fischer']);
  });

  it('excludes past dates by default and includes them on request', () => {
    // GIVEN one past and one upcoming date
    const workDates = [workDate('1', '2026-09-01'), workDate('2', '2026-09-20')];

    // WHEN building without past dates
    const upcoming = buildAppointmentExport({ workDates, assignments: [], includePast: false, today: TODAY });

    // THEN only the upcoming one is present
    expect(upcoming.appointments.map(a => a.date)).toEqual(['2026-09-20']);

    // WHEN building with past dates
    const all = buildAppointmentExport({ workDates, assignments: [], includePast: true, today: TODAY });

    // THEN both are present, oldest first
    expect(all.appointments.map(a => a.date)).toEqual(['2026-09-01', '2026-09-20']);
  });

  it('treats a date falling on today as upcoming', () => {
    // GIVEN a date equal to today, which is the boundary the filter turns on
    const workDates = [workDate('1', '2026-09-15')];

    // WHEN building without past dates
    const result = buildAppointmentExport({ workDates, assignments: [], includePast: false, today: TODAY });

    // THEN it is kept, because a shift this evening still belongs on the sheet
    expect(result.appointments.map(a => a.date)).toEqual(['2026-09-15']);
  });

  it('sorts appointments by date regardless of input order', () => {
    // GIVEN dates supplied newest first
    const workDates = [workDate('2', '2026-10-05'), workDate('1', '2026-09-20')];

    // WHEN building the export
    const result = buildAppointmentExport({ workDates, assignments: [], includePast: false, today: TODAY });

    // THEN they come back ascending
    expect(result.appointments.map(a => a.date)).toEqual(['2026-09-20', '2026-10-05']);
  });

  it('orders assigned names by German collation and trims the time', () => {
    // GIVEN three members whose order differs between code point and German collation
    const workDates = [workDate('1', '2026-09-20', { start_time: '15:30:00' })];
    const assignments = [
      assignment('1', 'm1', 'Zacharias Weber'),
      assignment('1', 'm2', 'Örtel Anna'),
      assignment('1', 'm3', 'Anton Bauer'),
    ];
    const localeCompareSpy = vi.spyOn(String.prototype, 'localeCompare');

    // WHEN building the export
    const result = buildAppointmentExport({ workDates, assignments, includePast: false, today: TODAY });

    // THEN Ö sorts as a German reader expects rather than after Z
    expect(result.appointments[0].assignedNames).toEqual(['Anton Bauer', 'Örtel Anna', 'Zacharias Weber']);

    // THEN the sort explicitly requested German collation. This machine's default locale (and most
    // others) already order these particular names the same way, so the array assertion above would
    // still pass with a bare localeCompare(); this checks the actual call instead of relying on that
    // coincidence.
    expect(localeCompareSpy.mock.calls.some(call => call[1] === 'de')).toBe(true);
    localeCompareSpy.mockRestore();

    // THEN the PostgREST time is trimmed for display
    expect(result.appointments[0].startTime).toBe('15:30');
  });

  it('reports a missing start time as null rather than an empty string', () => {
    // GIVEN a date with no start time
    const workDates = [workDate('1', '2026-09-20', { start_time: null })];

    // WHEN building the export
    const result = buildAppointmentExport({ workDates, assignments: [], includePast: false, today: TODAY });

    // THEN the field is null, so the renderer can choose its own placeholder
    expect(result.appointments[0].startTime).toBeNull();
  });

  it('skips an assignment whose member join came back null', () => {
    // GIVEN an assignment with no joined member
    const workDates = [workDate('1', '2026-09-20')];
    const assignments: ExportAssignmentInput[] = [
      { workdate_id: '1', member_id: 'm1', status: 'Published', members: null },
    ];

    // WHEN building the export
    const result = buildAppointmentExport({ workDates, assignments, includePast: false, today: TODAY });

    // THEN it contributes no nameless entry
    expect(result.appointments[0].assignedNames).toEqual([]);
  });
});

describe('buildAppointmentExport memberShifts', () => {
  it('lists every member holding a duty, including one with a single shift', () => {
    // GIVEN one member on two dates, supplied newest first, and another on a single date
    const workDates = [workDate('1', '2026-09-20'), workDate('2', '2026-10-05')];
    const assignments = [
      assignment('2', 'm1', 'Anna Fischer'),
      assignment('1', 'm1', 'Anna Fischer'),
      assignment('1', 'm2', 'Thomas Müller'),
    ];

    // WHEN building the export
    const result = buildAppointmentExport({ workDates, assignments, includePast: false, today: TODAY });

    // THEN both appear, the busier one first, and the single-shift member is not filtered out
    expect(result.memberShifts).toEqual([
      { name: 'Anna Fischer', count: 2, dates: ['2026-09-20', '2026-10-05'] },
      { name: 'Thomas Müller', count: 1, dates: ['2026-09-20'] },
    ]);
  });

  it('leaves out a member with no duty at all rather than listing them at zero', () => {
    // GIVEN two members, only one of whom is assigned anything
    const workDates = [workDate('1', '2026-09-20')];
    const assignments = [assignment('1', 'm1', 'Anna Fischer')];

    // WHEN building the export
    const result = buildAppointmentExport({ workDates, assignments, includePast: false, today: TODAY });

    // THEN the table covers who is working, not the whole roster
    expect(result.memberShifts.map(m => m.name)).toEqual(['Anna Fischer']);
  });

  it('sorts by count descending, then by name', () => {
    // GIVEN three members with three, two and two shifts
    const workDates = [
      workDate('1', '2026-09-20'),
      workDate('2', '2026-10-05'),
      workDate('3', '2026-10-12'),
    ];
    const assignments = [
      assignment('1', 'm1', 'Berta Braun'),
      assignment('2', 'm1', 'Berta Braun'),
      assignment('3', 'm1', 'Berta Braun'),
      assignment('1', 'm2', 'Zacharias Weber'),
      assignment('2', 'm2', 'Zacharias Weber'),
      assignment('1', 'm3', 'Anton Bauer'),
      assignment('2', 'm3', 'Anton Bauer'),
    ];

    // WHEN building the export
    const result = buildAppointmentExport({ workDates, assignments, includePast: false, today: TODAY });

    // THEN the busiest comes first, and the two tied on count order by name
    expect(result.memberShifts.map(m => [m.name, m.count])).toEqual([
      ['Berta Braun', 3],
      ['Anton Bauer', 2],
      ['Zacharias Weber', 2],
    ]);
  });

  it('counts only shifts on dates the document covers', () => {
    // GIVEN a member with one past and one upcoming shift
    const workDates = [workDate('1', '2026-09-01'), workDate('2', '2026-09-20')];
    const assignments = [
      assignment('1', 'm1', 'Anna Fischer'),
      assignment('2', 'm1', 'Anna Fischer'),
    ];

    // WHEN building without past dates
    const upcoming = buildAppointmentExport({ workDates, assignments, includePast: false, today: TODAY });

    // THEN only the in-range shift is counted and listed, so the table never cites a date the reader
    // cannot find in the appointments above
    expect(upcoming.memberShifts).toEqual([
      { name: 'Anna Fischer', count: 1, dates: ['2026-09-20'] },
    ]);

    // WHEN building with past dates
    const all = buildAppointmentExport({ workDates, assignments, includePast: true, today: TODAY });

    // THEN both count and she appears
    expect(all.memberShifts).toEqual([
      { name: 'Anna Fischer', count: 2, dates: ['2026-09-01', '2026-09-20'] },
    ]);
  });

  it('ignores draft assignments when counting', () => {
    // GIVEN a member with one published and one draft shift
    const workDates = [workDate('1', '2026-09-20'), workDate('2', '2026-10-05')];
    const assignments = [
      assignment('1', 'm1', 'Anna Fischer'),
      assignment('2', 'm1', 'Anna Fischer', 'Draft'),
    ];

    // WHEN building the export
    const result = buildAppointmentExport({ workDates, assignments, includePast: false, today: TODAY });

    // THEN only the published shift is counted, so the draft is invisible here as well as in the
    // appointments table
    expect(result.memberShifts).toEqual([
      { name: 'Anna Fischer', count: 1, dates: ['2026-09-20'] },
    ]);
  });
});

describe('buildAppointmentExport range', () => {
  it('spans the first and last kept appointment', () => {
    // GIVEN three upcoming dates
    const workDates = [
      workDate('1', '2026-09-20'),
      workDate('2', '2026-10-05'),
      workDate('3', '2026-10-12'),
    ];

    // WHEN building the export
    const result = buildAppointmentExport({ workDates, assignments: [], includePast: false, today: TODAY });

    // THEN the range covers the ends, for the document subtitle
    expect(result.range).toEqual({ from: '2026-09-20', to: '2026-10-12' });
  });

  it('returns empty tables and a null range for no input', () => {
    // GIVEN nothing at all
    // WHEN building the export
    const result = buildAppointmentExport({ workDates: [], assignments: [], includePast: true, today: TODAY });

    // THEN the caller gets empty structures rather than an exception
    expect(result.appointments).toEqual([]);
    expect(result.memberShifts).toEqual([]);
    expect(result.range).toBeNull();
  });
});
