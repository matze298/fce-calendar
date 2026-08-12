import { describe, expect, it } from 'vitest';

import { generateAssignments, type ScheduleMember, type ScheduleWorkDate } from '@/utils/schedule';

function member(id: string, overrides: Partial<ScheduleMember> = {}): ScheduleMember {
  return {
    id,
    seniority_level: 'Junior',
    availability: 'Any',
    historical_shifts: 0,
    bereiche: ['Sportheim-Bewirtung'],
    ...overrides,
  };
}

function workDate(id: string, date: string, overrides: Partial<ScheduleWorkDate> = {}): ScheduleWorkDate {
  return {
    id,
    date,
    bereich: 'Sportheim-Bewirtung',
    required_people: 1,
    is_important_shift: false,
    is_weekend: false,
    ...overrides,
  };
}

describe('generateAssignments phases', () => {
  it('gives important shifts to Seniors even when they have worked more', () => {
    // GIVEN a Senior with five shifts behind them and a Junior with none
    const members = [
      member('senior', { seniority_level: 'Senior', historical_shifts: 5 }),
      member('junior', { seniority_level: 'Junior', historical_shifts: 0 }),
    ];

    // GIVEN one important shift
    const workDates = [workDate('101', '2026-09-16', { is_important_shift: true })];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates });

    // THEN seniority wins over fairness for important shifts
    expect(assignments).toEqual([{ member_id: 'senior', workdate_id: '101', status: 'Draft' }]);
  });

  it('picks the member with the fewest shifts for an ordinary weekday', () => {
    // GIVEN three members with differing histories
    const members = [
      member('a', { historical_shifts: 10 }),
      member('b', { historical_shifts: 2 }),
      member('c', { historical_shifts: 5 }),
    ];

    // GIVEN one weekday shift
    const workDates = [workDate('101', '2026-09-16')];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates });

    // THEN the least-used member is chosen
    expect(assignments.map(a => a.member_id)).toEqual(['b']);
  });

  it('respects weekday-only and weekend-only availability', () => {
    // GIVEN one weekday-only and one weekend-only member
    const members = [
      member('weekday', { availability: 'Weekdays' }),
      member('weekend', { availability: 'Weekends' }),
    ];

    // GIVEN a weekend shift
    const workDates = [workDate('101', '2026-09-19', { is_weekend: true })];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates });

    // THEN only the weekend-available member is eligible
    expect(assignments.map(a => a.member_id)).toEqual(['weekend']);
  });
});

describe('generateAssignments cooldown', () => {
  it('skips a member already booked inside the cooldown window in this run', () => {
    // GIVEN a fresh member and a heavily used one
    const members = [member('fresh', { historical_shifts: 0 }), member('used', { historical_shifts: 10 })];

    // GIVEN two shifts one week apart, inside a 21 day cooldown
    const workDates = [workDate('101', '2026-09-16'), workDate('102', '2026-09-23')];

    // WHEN generating with the default cooldown
    const assignments = generateAssignments({ members, workDates, cooldownDays: 21 });

    // THEN the fresh member takes the first shift and is then in cooldown for the second
    expect(assignments.map(a => a.member_id)).toEqual(['fresh', 'used']);
  });

  it('counts already published assignments toward the cooldown window', () => {
    // GIVEN a fresh member who is already published onto an earlier shift
    const members = [member('fresh', { historical_shifts: 0 }), member('used', { historical_shifts: 10 })];

    // GIVEN that earlier shift is already fully staffed, so it needs no new draft
    const workDates = [workDate('101', '2026-09-16'), workDate('102', '2026-09-21')];
    const publishedAssignments = [{ member_id: 'fresh', workdate_id: '101' }];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates, publishedAssignments, cooldownDays: 21 });

    // THEN the second shift goes to the other member, because the published one put fresh in cooldown.
    // This is the case neither previous implementation handled.
    expect(assignments).toEqual([{ member_id: 'used', workdate_id: '102', status: 'Draft' }]);
  });

  it('still fills a shift when everyone eligible is in cooldown', () => {
    // GIVEN a single member, so there is nobody to fall back to
    const members = [member('only')];

    // GIVEN two shifts a day apart, well inside any cooldown
    const workDates = [workDate('101', '2026-09-16'), workDate('102', '2026-09-17')];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates, cooldownDays: 21 });

    // THEN cooldown yields rather than leaving a shift unstaffed, as blueprint section 3 requires
    expect(assignments.map(a => a.workdate_id)).toEqual(['101', '102']);
  });

  it('treats a zero cooldown as no cooldown at all', () => {
    // GIVEN one member and two adjacent shifts
    const members = [member('only')];
    const workDates = [workDate('101', '2026-09-16'), workDate('102', '2026-09-17')];

    // WHEN generating with the cooldown switched off
    const assignments = generateAssignments({ members, workDates, cooldownDays: 0 });

    // THEN both shifts are filled without the fallback being needed
    expect(assignments).toHaveLength(2);
  });
});

describe('generateAssignments and already published work', () => {
  it('counts published shifts toward fairness, not just historical_shifts', () => {
    // GIVEN a member with no history but three published shifts, and one with two historical shifts
    const members = [member('busy', { historical_shifts: 0 }), member('quiet', { historical_shifts: 2 })];

    // GIVEN the published shifts sit far outside the cooldown window, so only fairness is in play
    const workDates = [
      workDate('091', '2026-01-05'),
      workDate('092', '2026-01-12'),
      workDate('093', '2026-01-19'),
      workDate('101', '2026-09-16'),
    ];
    const publishedAssignments = [
      { member_id: 'busy', workdate_id: '091' },
      { member_id: 'busy', workdate_id: '092' },
      { member_id: 'busy', workdate_id: '093' },
    ];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates, publishedAssignments });

    // THEN the September shift goes to the quieter member, counting 3 published against 2 historical
    const september = assignments.find(a => a.workdate_id === '101');
    expect(september?.member_id).toBe('quiet');
  });

  it('counts published assignments toward a date\'s required_people', () => {
    // GIVEN a shift needing two people, with one already published onto it
    const members = [member('a'), member('b'), member('c')];
    const workDates = [workDate('101', '2026-09-16', { required_people: 2 })];
    const publishedAssignments = [{ member_id: 'a', workdate_id: '101' }];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates, publishedAssignments });

    // THEN only the one remaining slot is filled, rather than two more on top
    expect(assignments).toHaveLength(1);
  });

  it('does not assign a member twice to the same date', () => {
    // GIVEN a shift needing two people, with the fairest member already published onto it
    const members = [member('a', { historical_shifts: 0 }), member('b', { historical_shifts: 9 })];
    const workDates = [workDate('101', '2026-09-16', { required_people: 2 })];
    const publishedAssignments = [{ member_id: 'a', workdate_id: '101' }];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates, publishedAssignments });

    // THEN the slot goes to the other member, even though a is fairer on paper
    expect(assignments).toEqual([{ member_id: 'b', workdate_id: '101', status: 'Draft' }]);
  });
});

describe('generateAssignments edge cases', () => {
  it('treats a missing required_people as one person', () => {
    // GIVEN a date whose required_people is null, as the column allows
    const members = [member('a'), member('b')];
    const workDates = [workDate('101', '2026-09-16', { required_people: null })];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates });

    // THEN exactly one person is assigned
    expect(assignments).toHaveLength(1);
  });

  it('returns nothing when no member is eligible for the phase', () => {
    // GIVEN only weekend-available members
    const members = [member('weekend', { availability: 'Weekends' })];

    // GIVEN a weekday shift
    const workDates = [workDate('101', '2026-09-16')];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates });

    // THEN the shift is left unstaffed rather than filled by an unavailable member
    expect(assignments).toEqual([]);
  });

  it('ignores a published assignment whose work date is unknown', () => {
    // GIVEN a published assignment pointing at a date not in the current set
    const members = [member('a')];
    const workDates = [workDate('101', '2026-09-16')];
    const publishedAssignments = [{ member_id: 'a', workdate_id: 'gone' }];

    // WHEN generating
    const assignments = generateAssignments({ members, workDates, publishedAssignments });

    // THEN it still counts toward fairness but cannot be measured for cooldown, so the run proceeds
    expect(assignments).toEqual([{ member_id: 'a', workdate_id: '101', status: 'Draft' }]);
  });
});

describe('generateAssignments across Bereiche', () => {
  it('never offers a Bereich to a member who is not available for it', () => {
    // GIVEN one Fruehschoppen date and two members, only one of whom does Fruehschoppen. Both start
    // tied on shift count, and the tie-break keeps incoming order, so the unavailable member is
    // listed first deliberately: that way the assertion only passes if the availability filter is
    // what excludes them, rather than the tie-break happening to favor the other member anyway.
    const workDates = [workDate('w1', '2026-09-20', { bereich: 'Fruehschoppen' })];
    const members = [
      member('does-not', { bereiche: ['Sportheim-Bewirtung'] }),
      member('does-it', { bereiche: ['Sportheim-Bewirtung', 'Fruehschoppen'] }),
    ];

    // WHEN generating
    const drafts = generateAssignments({ members, workDates });

    // THEN only the available member is picked, even though the unavailable one is listed first
    // and both are tied on shift count
    expect(drafts.map(d => d.member_id)).toEqual(['does-it']);
  });

  it('counts fairness separately per Bereich', () => {
    // GIVEN a member heavy on published Sportheim duties and light on Fruehschoppen, against a
    // member with the reverse
    const workDates = [workDate('f1', '2026-09-20', { bereich: 'Fruehschoppen' })];
    const members = [
      member('sportheim-heavy', { bereiche: ['Sportheim-Bewirtung', 'Fruehschoppen'] }),
      member('fruehschoppen-heavy', { bereiche: ['Sportheim-Bewirtung', 'Fruehschoppen'] }),
    ];
    const publishedAssignments = [
      { member_id: 'sportheim-heavy', workdate_id: 's-past-1' },
      { member_id: 'sportheim-heavy', workdate_id: 's-past-2' },
      { member_id: 'fruehschoppen-heavy', workdate_id: 'f-past-1' },
    ];
    const pastDates = [
      workDate('s-past-1', '2026-01-05', { bereich: 'Sportheim-Bewirtung' }),
      workDate('s-past-2', '2026-01-12', { bereich: 'Sportheim-Bewirtung' }),
      workDate('f-past-1', '2026-01-19', { bereich: 'Fruehschoppen' }),
    ];

    // WHEN generating the Fruehschoppen date
    const drafts = generateAssignments({
      members,
      workDates: [...pastDates, ...workDates],
      publishedAssignments,
      cooldownDays: 0,
    });

    // THEN the member with fewer Fruehschoppen duties wins, even though they have more duties
    // overall, because each Bereich keeps its own rota
    const chosen = drafts.filter(d => d.workdate_id === 'f1');
    expect(chosen.map(d => d.member_id)).toEqual(['sportheim-heavy']);
  });

  it('counts historical_shifts toward Sportheim-Bewirtung only', () => {
    // GIVEN a veteran with fifteen recorded duties and a newcomer with none, both available for
    // both Bereiche
    const members = [
      member('veteran', { historical_shifts: 15, bereiche: ['Sportheim-Bewirtung', 'Fruehschoppen'] }),
      member('newcomer', { historical_shifts: 0, bereiche: ['Sportheim-Bewirtung', 'Fruehschoppen'] }),
    ];

    // WHEN a Sportheim date is filled
    const sportheim = generateAssignments({
      members,
      workDates: [workDate('s1', '2026-09-20', { bereich: 'Sportheim-Bewirtung' })],
    });

    // THEN the newcomer goes first, because the recorded duties were Sportheim duties
    expect(sportheim.map(d => d.member_id)).toEqual(['newcomer']);

    // WHEN a Fruehschoppen date is filled instead
    const fruehschoppen = generateAssignments({
      members,
      workDates: [workDate('f1', '2026-09-20', { bereich: 'Fruehschoppen' })],
    });

    // THEN the veteran is no longer penalized, because nobody has worked Fruehschoppen at all and
    // the recorded duties say nothing about it. Ties keep incoming order, so the veteran is first.
    expect(fruehschoppen.map(d => d.member_id)).toEqual(['veteran']);
  });

  it('never places one member twice on the same calendar date', () => {
    // GIVEN a date needing both Bereiche and only one available member
    const workDates = [
      workDate('s1', '2026-09-20', { bereich: 'Sportheim-Bewirtung', required_people: 1 }),
      workDate('o1', '2026-09-20', { bereich: 'Sportplatz-Ordner', required_people: 1 }),
    ];
    const members = [member('only-one', { bereiche: ['Sportheim-Bewirtung', 'Sportplatz-Ordner'] })];

    // WHEN generating
    const drafts = generateAssignments({ members, workDates, cooldownDays: 0 });

    // THEN they take exactly one of the two, and the other stays unfilled rather than
    // double-booking them, which the database would refuse anyway
    expect(drafts).toHaveLength(1);
  });

  it('places the same member on adjacent dates in different Bereiche when cooldown allows', () => {
    // GIVEN two neighboring dates in different Bereiche and no cooldown
    const workDates = [
      workDate('s1', '2026-09-20', { bereich: 'Sportheim-Bewirtung' }),
      workDate('o1', '2026-09-21', { bereich: 'Sportplatz-Ordner' }),
    ];
    const members = [member('willing', { bereiche: ['Sportheim-Bewirtung', 'Sportplatz-Ordner'] })];

    // WHEN generating with cooldown off
    const drafts = generateAssignments({ members, workDates, cooldownDays: 0 });

    // THEN both are filled, because the rule is one duty per date and not one duty per weekend
    expect(drafts).toHaveLength(2);
  });

  it('ignores a published assignment whose work date was not supplied', () => {
    // GIVEN a published assignment pointing at a date the caller did not pass in
    const workDates = [workDate('s1', '2026-09-20', { bereich: 'Sportheim-Bewirtung' })];
    const members = [member('a'), member('b')];

    // WHEN generating
    const drafts = generateAssignments({
      members,
      workDates,
      publishedAssignments: [{ member_id: 'a', workdate_id: 'unknown-date' }],
      cooldownDays: 0,
    });

    // THEN it goes to a rather than being held against them: the unattributed published assignment
    // must not inflate a's shift count, or the tie would break toward b instead. Checking length
    // alone would not catch that, since either member filling the one slot yields length 1.
    expect(drafts.map(d => d.member_id)).toEqual(['a']);
  });
});
