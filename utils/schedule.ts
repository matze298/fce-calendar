import { parseIsoDate } from '@/utils/startTime';

/** The member fields the scheduler reads. `historical_shifts` is the fairness baseline. */
export type ScheduleMember = {
  id: string;
  seniority_level: string;
  availability: string;
  historical_shifts: number | null;
};

/** The work date fields the scheduler reads. */
export type ScheduleWorkDate = {
  id: string;
  date: string;
  required_people: number | null;
  is_important_shift: boolean;
  is_weekend: boolean;
};

/** An assignment that already exists, whether published or drafted by this run. */
export type ExistingAssignment = {
  member_id: string;
  workdate_id: string;
};

export type DraftAssignment = ExistingAssignment & { status: 'Draft' };

export type GenerateInput = {
  members: ScheduleMember[];
  workDates: ScheduleWorkDate[];
  /** Assignments already published, which count toward both fairness and cooldown. */
  publishedAssignments?: ExistingAssignment[];
  cooldownDays?: number;
};

const MS_PER_DAY = 86_400_000;

/**
 * Builds the draft plan, in three phases: Seniors onto important shifts, then weekend-available
 * members onto weekends, then weekday-available members onto the rest.
 *
 * Within a phase the least-used member wins, counting historical shifts plus everything already
 * published plus anything assigned earlier in this run. Cooldown is a soft constraint: members with
 * another assignment inside the window are held back, but if that empties the pool the shift is
 * filled anyway rather than left short.
 */
export function generateAssignments({
  members,
  workDates,
  publishedAssignments = [],
  cooldownDays = 21,
}: GenerateInput): DraftAssignment[] {
  const dateById = new Map(workDates.map(d => [d.id, parseIsoDate(d.date)]));
  const drafts: DraftAssignment[] = [];

  const shiftCounts = new Map(
    members.map(m => [
      m.id,
      (m.historical_shifts ?? 0) + publishedAssignments.filter(a => a.member_id === m.id).length,
    ]),
  );

  const phases: { dates: ScheduleWorkDate[]; eligible: (m: ScheduleMember) => boolean }[] = [
    {
      dates: workDates.filter(d => d.is_important_shift),
      eligible: m => m.seniority_level === 'Senior',
    },
    {
      dates: workDates.filter(d => d.is_weekend && !d.is_important_shift),
      eligible: m => ['Weekends', 'Any'].includes(m.availability),
    },
    {
      dates: workDates.filter(d => !d.is_weekend && !d.is_important_shift),
      eligible: m => ['Weekdays', 'Any'].includes(m.availability),
    },
  ];

  for (const phase of phases) {
    for (const date of phase.dates) {
      const taken = [...publishedAssignments, ...drafts].filter(a => a.workdate_id === date.id);
      const remaining = Math.max(0, (date.required_people ?? 1) - taken.length);
      if (remaining === 0) continue;

      const pool = members.filter(
        m => phase.eligible(m) && !taken.some(a => a.member_id === m.id),
      );

      const rested = pool.filter(
        m => !isInCooldown(m.id, date.id, { dateById, publishedAssignments, drafts, cooldownDays }),
      );

      // Soft constraint: an empty rested pool means filling the shift beats honoring the cooldown.
      const finalPool = rested.length > 0 ? rested : pool;

      // Stable sort, so members tied on shift count keep their incoming order.
      const chosen = [...finalPool]
        .sort((a, b) => (shiftCounts.get(a.id) ?? 0) - (shiftCounts.get(b.id) ?? 0))
        .slice(0, remaining);

      for (const m of chosen) {
        drafts.push({ member_id: m.id, workdate_id: date.id, status: 'Draft' });
        shiftCounts.set(m.id, (shiftCounts.get(m.id) ?? 0) + 1);
      }
    }
  }

  return drafts;
}

/** Whether the member holds another assignment within `cooldownDays` of the target date. */
function isInCooldown(
  memberId: string,
  targetDateId: string,
  context: {
    dateById: Map<string, Date>;
    publishedAssignments: ExistingAssignment[];
    drafts: DraftAssignment[];
    cooldownDays: number;
  },
): boolean {
  const { dateById, publishedAssignments, drafts, cooldownDays } = context;
  if (cooldownDays <= 0) return false;

  const target = dateById.get(targetDateId);
  if (!target) return false;

  return [...publishedAssignments, ...drafts]
    .filter(a => a.member_id === memberId && a.workdate_id !== targetDateId)
    .some(a => {
      const other = dateById.get(a.workdate_id);
      // An assignment on a date outside this run cannot be measured, so it cannot block.
      if (!other) return false;

      // Rounded because a span crossing a DST change is not a whole 24 hour multiple.
      const days = Math.abs(Math.round((target.getTime() - other.getTime()) / MS_PER_DAY));
      return days < cooldownDays;
    });
}
