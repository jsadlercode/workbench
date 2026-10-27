/**
 * Focused time as text, in whole minutes: "25 min", "1 h 15 min", "2 h", or "under 1 min".
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export function useFocusDuration(): (seconds: number) => string {
  const { t } = useTranslation('tasks');
  return useCallback(
    (seconds: number) => {
      const totalMinutes = Math.round(Math.max(0, seconds) / 60);
      if (totalMinutes < 1) return t('focus.duration.underMinute');
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours === 0) return t('focus.duration.minutes', { minutes });
      if (minutes === 0) return t('focus.duration.hours', { hours });
      return t('focus.duration.hoursMinutes', { hours, minutes });
    },
    [t]
  );
}
