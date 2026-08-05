import { describe, expect, it } from 'vitest';

import {
  defaultStartTimeFor,
  isWeekendDate,
  parseIsoDate,
  readStartTimeDefaults,
  START_TIME_FALLBACKS,
  toTimeInputValue,
} from '@/utils/startTime';

describe('toTimeInputValue', () => {
  it('trims a PostgREST TIME value to what a time input accepts', () => {
    // GIVEN a TIME value as PostgREST returns it
    const value = '20:00:00';

    // WHEN trimming it for a time input
    const trimmed = toTimeInputValue(value);

    // THEN the seconds are gone
    expect(trimmed).toBe('20:00');
  });

  it('renders a missing time as an empty input rather than a literal', () => {
    // GIVEN a work date with no start time, in both shapes PostgREST and React produce
    // WHEN trimming each
    // THEN both yield an empty string, never "null" or "undefined"
    expect(toTimeInputValue(null)).toBe('');
    expect(toTimeInputValue(undefined)).toBe('');
  });
});

describe('defaultStartTimeFor', () => {
  // GIVEN configured defaults where every bucket differs, so a wrong bucket cannot pass
  const defaults = {
    default_start_time_mon_thu: '20:00:00',
    default_start_time_fri: '18:30:00',
    default_start_time_sat_sun: '15:30:00',
  };

  it('picks the Monday to Thursday bucket for a midweek date', () => {
    // WHEN resolving a Wednesday
    // THEN the midweek default applies
    expect(defaultStartTimeFor('2026-09-16', defaults)).toBe('20:00');
  });

  it('gives Friday its own bucket rather than the weekend one', () => {
    // WHEN resolving a Friday
    // THEN the Friday default applies, even though the scheduler counts Friday as weekend
    expect(defaultStartTimeFor('2026-09-18', defaults)).toBe('18:30');
  });

  it('picks the weekend bucket for Saturday and Sunday', () => {
    // WHEN resolving a Saturday and a Sunday
    // THEN both take the weekend default
    expect(defaultStartTimeFor('2026-09-19', defaults)).toBe('15:30');
    expect(defaultStartTimeFor('2026-09-20', defaults)).toBe('15:30');
  });
});

describe('isWeekendDate', () => {
  it('counts Friday, Saturday and Sunday as weekend shifts', () => {
    // GIVEN a Friday, Saturday and Sunday
    // WHEN classifying each for the scheduler
    // THEN all three are weekend shifts
    expect(isWeekendDate('2026-09-18')).toBe(true);
    expect(isWeekendDate('2026-09-19')).toBe(true);
    expect(isWeekendDate('2026-09-20')).toBe(true);
  });

  it('does not count Monday through Thursday', () => {
    // GIVEN a Monday and a Thursday
    // WHEN classifying each
    // THEN neither is a weekend shift
    expect(isWeekendDate('2026-09-14')).toBe(false);
    expect(isWeekendDate('2026-09-17')).toBe(false);
  });
});

describe('readStartTimeDefaults', () => {
  it('trims the seconds off every bucket', () => {
    // GIVEN a settings row straight from PostgREST
    const row = {
      default_start_time_mon_thu: '20:00:00',
      default_start_time_fri: '18:30:00',
      default_start_time_sat_sun: '15:30:00',
    };

    // WHEN normalizing it for the settings form
    const defaults = readStartTimeDefaults(row);

    // THEN all three are input ready
    expect(defaults).toEqual({
      default_start_time_mon_thu: '20:00',
      default_start_time_fri: '18:30',
      default_start_time_sat_sun: '15:30',
    });
  });

  it('falls back per bucket when a column is null or absent', () => {
    // GIVEN a row where one bucket is null and the others are missing entirely
    const row = { default_start_time_fri: null };

    // WHEN normalizing it
    const defaults = readStartTimeDefaults(row);

    // THEN each bucket falls back rather than rendering an empty time input
    expect(defaults).toEqual(START_TIME_FALLBACKS);
  });
});

describe('parseIsoDate', () => {
  it('reads a date-only string as that local calendar day', () => {
    // GIVEN the first of a month, the value most likely to slip backwards
    const isoDate = '2026-05-01';

    // WHEN parsing it
    const parsed = parseIsoDate(isoDate);

    // THEN the calendar fields match the string, with no UTC detour shifting the day
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(4);
    expect(parsed.getDate()).toBe(1);
  });

  it('agrees with the weekday the scheduler buckets on', () => {
    // GIVEN a known Saturday
    // WHEN parsing it
    // THEN the local weekday is Saturday, which is what isWeekendDate relies on
    expect(parseIsoDate('2026-09-19').getDay()).toBe(6);
  });
});
