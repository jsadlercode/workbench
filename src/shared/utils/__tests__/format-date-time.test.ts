import { describe, it, expect } from 'vitest';
import { formatDateTime, formatShortDateTime, formatTime } from '../format-date-time';

describe('formatTime', () => {
  it('shows local time with seconds and AM/PM', () => {
    expect(formatTime(new Date(2026, 9, 10, 1, 35, 21))).toBe('1:35:21 AM');
    expect(formatTime(new Date(2026, 9, 10, 13, 5, 9))).toBe('1:05:09 PM');
  });

  it('accepts ISO strings and converts them to local time', () => {
    const local = new Date(2026, 9, 10, 1, 35, 21);
    expect(formatTime(local.toISOString())).toBe('1:35:21 AM');
  });

  it('returns an empty string for invalid dates', () => {
    expect(formatTime('not a date')).toBe('');
  });
});

describe('formatDateTime', () => {
  it('shows the local date and time', () => {
    expect(formatDateTime(new Date(2026, 9, 10, 1, 35, 21))).toBe('10/10/2026, 1:35:21 AM');
  });

  it('returns an empty string for invalid dates', () => {
    expect(formatDateTime('')).toBe('');
  });
});

describe('formatShortDateTime', () => {
  const now = new Date(2026, 9, 27, 18, 0);

  it('shows day, short month and time without seconds, with the year only when it is not this year', () => {
    expect(formatShortDateTime(new Date(2026, 9, 27, 14, 5), now)).toBe('27 Oct, 2:05 PM');
    expect(formatShortDateTime(new Date(2026, 0, 3, 9, 7).toISOString(), now)).toBe('3 Jan, 9:07 AM');
    expect(formatShortDateTime(new Date(2025, 11, 31, 23, 59), now)).toBe('31 Dec 2025, 11:59 PM');
  });

  it('returns an empty string for invalid dates', () => {
    expect(formatShortDateTime('not a date', now)).toBe('');
  });
});
