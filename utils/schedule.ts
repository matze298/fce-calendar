import { parseIsoDate } from '@/utils/startTime';

/** The member fields the scheduler reads. `historical_shifts` is the fairness baseline. */
export type ScheduleMember = {
  id: string;
  seniority_level: string;
  availability: string;
  historical_shifts: number | null;
  /** Bereiche this member is available for. A Bereich absent here is never offered to them. */
  bereiche: string[];
};

/** The work date fields the scheduler reads. */
export type ScheduleWorkDate = {
  id: string;
  date: string;
  bereich: string;
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
 * Builds the draft plan, one Bereich at a time, in three phases per Bereich: Seniors onto important
 * shifts, then weekend-available members onto weekends, then weekday-available members onto the
 * rest. A member is only ever considered for a Bereich they are listed as available for.
 *
 * Within a phase the least-used member wins, counting historical shifts plus everything already
 * published plus anything assigned earlier in this run, all scoped to that Bereich. Cooldown is
 * also scoped to the Bereich, but a soft constraint: members with another assignment inside the
 * window are held back, but if that empties the pool the shift is filled anyway rather than left
 * short. The one cross-Bereich rule is that nobody is drafted twice onto the same calendar date,
 * matching the database trigger that enforces it.
 *
 * The Bereiche are iterated in the order they first appear in `workDates`, which is stable for a
 * given input but not alphabetical. That is fine: Bereiche never compete with each other for
 * slots, only for people, and the same-date exclusion is the only place they interact.
 */
export function generateAssignments({
  members,
  workDates,
  publishedAssignments = [],
  cooldownDays = 21,
}: GenerateInput): DraftAssignment[] {
  const dateById = new Map(workDates.map(d => [d.id, parseIsoDate(d.date)]));
  const bereichById = new Map(workDates.map(d => [d.id, d.bereich]));
  const isoDateById = new Map(workDates.map(d => [d.id, d.date]));
  const drafts: DraftAssignment[] = [];

  for (const bereich of [...new Set(workDates.map(d => d.bereich))]) {
    const bereichDates = workDates.filter(d => d.bereich === bereich);
    const candidates = members.filter(m => m.bereiche.includes(bereich));

    // Fairness is per Bereich, so only this Bereich's published assignments count, plus the
    // historical baseline when this is the Bereich those duties were worked in. An assignment whose
    // work date was not supplied cannot be attributed to a Bereich, so it counts toward none.
    const publishedHere = publishedAssignments.filter(a => bereichById.get(a.workdate_id) === bereich);
    const shiftCounts = new Map(
      candidates.map(m => [
        m.id,
        (bereich === 'Sportheim-Bewirtung' ? (m.historical_shifts ?? 0) : 0) +
          publishedHere.filter(a => a.member_id === m.id).length,
      ]),
    );

    const phases: { dates: ScheduleWorkDate[]; eligible: (m: ScheduleMember) => boolean }[] = [
      {
        dates: bereichDates.filter(d => d.is_important_shift),
        eligible: m => m.seniority_level === 'Senior',
      },
      {
        dates: bereichDates.filter(d => d.is_weekend && !d.is_important_shift),
        eligible: m => ['Weekends', 'Any'].includes(m.availability),
      },
      {
        dates: bereichDates.filter(d => !d.is_weekend && !d.is_important_shift),
        eligible: m => ['Weekdays', 'Any'].includes(m.availability),
      },
    ];

    for (const phase of phases) {
      for (const date of phase.dates) {
        const taken = [...publishedHere, ...drafts].filter(a => a.workdate_id === date.id);
        const remaining = Math.max(0, (date.required_people ?? 1) - taken.length);
        if (remaining === 0) continue;

        // One duty per member per calendar date, across every Bereich, which is what the database
        // trigger enforces. Checking it here means the generated plan is one the trigger accepts.
        const busyToday = new Set(
          [...publishedAssignments, ...drafts]
            .filter(a => isoDateById.get(a.workdate_id) === date.date)
            .map(a => a.member_id),
        );

        const pool = candidates.filter(m => phase.eligible(m) && !busyToday.has(m.id));

        const draftsHere = drafts.filter(d => bereichById.get(d.workdate_id) === bereich);
        const rested = pool.filter(
          m =>
            !isInCooldown(m.id, date.id, {
              dateById,
              publishedAssignments: publishedHere,
              drafts: draftsHere,
              cooldownDays,
            }),
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
