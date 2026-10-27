/**
 * One line in a task's details on the focus sessions logged on it: "Focus: 3 sessions · 1 h 15 min".
 * Nothing is shown before the first session.
 */
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { useFocusDuration } from '../focus/useFocusDuration';
import { focusSummary } from '../../../shared/utils/focus';
import type { Task } from '../../../shared/types';

export function FocusSessionsSummary({ task }: { task: Task }) {
  const { t } = useTranslation('tasks');
  const duration = useFocusDuration();
  const { count, focusedSeconds } = focusSummary(task);
  if (count === 0) return null;

  return (
    <p className="flex items-center gap-2 text-sm text-(--nav-label-color)">
      <Timer className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="tabular-nums">{t('focus.detail.summary', { count, duration: duration(focusedSeconds) })}</span>
    </p>
  );
}
