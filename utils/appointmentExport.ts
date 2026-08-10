import { parseIsoDate, toTimeInputValue } from '@/utils/startTime';

export type ExportWorkDateInput = {
  id: string;
  date: string;
  name: string | null;
  start_time: string | null;
};

export type ExportAssignmentInput = {
  workdate_id: string;
  member_id: string;
  status: 'Draft' | 'Published';
  members: { name: string } | null;
};

export type ExportAppointment = {
  date: string;
  name: string | null;
  startTime: string | null;
  assignedNames: string[];
};

export type MemberShiftSummary = {
  name: string;
  count: number;
  dates: string[];
};

export type AppointmentExport = {
  appointments: ExportAppointment[];
  /** Every member holding at least one duty in range. A member with none does not appear. */
  memberShifts: MemberShiftSummary[];
  /** The span the document covers, for its subtitle. Null when nothing is in range. */
  range: { from: string; to: string } | null;
};

/**
 * The two tables the printable schedule is built from.
 *
 * Only published assignments count anywhere, so an unpublished plan can never tell somebody they are
 * working. `today` is a parameter rather than read from the clock, so the result is a function of its
 * input alone.
 */
export function buildAppointmentExport({
  workDates,
  assignments,
  includePast,
  today,
}: {
  workDates: ExportWorkDateInput[];
  assignments: ExportAssignmentInput[];
  includePast: boolean;
  today: Date;
}): AppointmentExport {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const keptDates = [...workDates]
    .filter(wd => includePast || parseIsoDate(wd.date) >= startOfToday)
    .sort((a, b) => a.date.localeCompare(b.date));

  // A null join carries no name, so it cannot appear in either table.
  const published = assignments.filter(
    (a): a is ExportAssignmentInput & { members: { name: string } } =>
      a.status === 'Published' && a.members !== null,
  );

  const appointments: ExportAppointment[] = keptDates.map(wd => ({
    date: wd.date,
    name: wd.name,
    startTime: toTimeInputValue(wd.start_time) || null,
    assignedNames: published
      .filter(a => a.workdate_id === wd.id)
      .map(a => a.members.name)
      .sort((left, right) => left.localeCompare(right, 'de')),
  }));

  const dateByWorkDateId = new Map(keptDates.map(wd => [wd.id, wd.date]));
  const shiftsByMember = new Map<string, { name: string; dates: string[] }>();

  for (const a of published) {
    const date = dateByWorkDateId.get(a.workdate_id);
    // Outside the kept range, so it must neither be counted nor listed.
    if (!date) continue;

    const entry = shiftsByMember.get(a.member_id) ?? { name: a.members.name, dates: [] };
    entry.dates.push(date);
    shiftsByMember.set(a.member_id, entry);
  }

  const memberShifts = [...shiftsByMember.values()]
    .map(entry => ({
      name: entry.name,
      count: entry.dates.length,
      dates: [...entry.dates].sort(),
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'de'));

  const range =
    appointments.length > 0
      ? { from: appointments[0].date, to: appointments[appointments.length - 1].date }
      : null;

  return { appointments, memberShifts, range };
}
