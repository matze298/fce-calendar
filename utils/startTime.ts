export type StartTimeDefaults = {
  default_start_time_mon_thu: string;
  default_start_time_fri: string;
  default_start_time_sat_sun: string;
};

/** Used until the settings row has loaded, and as the initial state of the settings form. */
export const START_TIME_FALLBACKS: StartTimeDefaults = {
  default_start_time_mon_thu: '20:00',
  default_start_time_fri: '20:00',
  default_start_time_sat_sun: '15:30',
};

/** The configured default start time for the weekday bucket a date falls into. */
export function defaultStartTimeFor(isoDate: string, defaults: StartTimeDefaults): string {
  const day = dayOfWeek(isoDate);
  if (day === 0 || day === 6) return toTimeInputValue(defaults.default_start_time_sat_sun);
  if (day === 5) return toTimeInputValue(defaults.default_start_time_fri);
  return toTimeInputValue(defaults.default_start_time_mon_thu);
}

/** Fri, Sat and Sun count as weekend shifts for the scheduler. */
export function isWeekendDate(isoDate: string): boolean {
  return [0, 5, 6].includes(dayOfWeek(isoDate));
}

/** Trims a PostgREST TIME value ("20:00:00") to what <input type="time"> accepts ("20:00"). */
export function toTimeInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : '';
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD string, read without a UTC detour. */
function dayOfWeek(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}
