/**
 * Date and time display: one format everywhere (UI and logs), in the computer's local time zone.
 * Times read like "1:35:21 AM" and dates with times like "10/10/2026, 1:35:21 AM", whatever the
 * system locale, since the app is English only. Stored timestamps stay ISO strings in UTC.
 */

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
};

function toDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The time in local time, like "1:35:21 AM" (empty for an invalid date) */
export function formatTime(value: Date | string | number): string {
  const date = toDate(value);
  return date ? date.toLocaleTimeString('en-US', TIME_OPTIONS) : '';
}

/** The date and time in local time, like "10/10/2026, 1:35:21 AM" (empty for an invalid date) */
export function formatDateTime(value: Date | string | number): string {
  const date = toDate(value);
  return date ? `${date.toLocaleDateString('en-US', DATE_OPTIONS)}, ${formatTime(date)}` : '';
}

/**
 * A day as day and short month, like "3 Nov", with the year when it isn't the year of `now`
 * ("3 Nov 2027"). For dates without a time, such as a task's deadline.
 */
export function formatShortDate(date: Date, now: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return '';
  const dayMonth = `${date.getDate()} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
  return date.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth} ${date.getFullYear()}`;
}

/**
 * A moment as day, short month and time without seconds, like "27 Oct, 2:05 PM", with the year
 * when it isn't the year of `now` ("27 Oct 2025, 2:05 PM"); empty for an invalid date. For short
 * lists of past events, such as a task's timeline.
 */
export function formatShortDateTime(value: Date | string | number, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return '';
  const time = date.toLocaleTimeString('en-US', { ...TIME_OPTIONS, second: undefined });
  return `${formatShortDate(date, now)}, ${time}`;
}
