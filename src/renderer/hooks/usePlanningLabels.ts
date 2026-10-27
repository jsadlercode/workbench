/**
 * Text for a task's planning (src/shared/utils/task-planning.ts), shared by the task card, the task
 * dialogs and the task's details.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatDateKey,
  planHorizon,
  plannedWeek,
  type DeadlineState
} from '../../shared/utils/task-planning';

export function usePlanningLabels() {
  const { t } = useTranslation('tasks');

  return useMemo(() => {
    /** "Due 3 Nov" / "By 3 Nov", or "Was due 3 Nov" / "Target was 3 Nov" once it has passed */
    const deadline = (state: DeadlineState, now: Date): string => {
      const date = formatDateKey(state.date, now);
      if (state.hard) return state.overdue ? t('planning.deadline.hardOverdue', { date }) : t('planning.deadline.hard', { date });
      return state.overdue ? t('planning.deadline.targetOverdue', { date }) : t('planning.deadline.target', { date });
    };

    /**
     * A week no choice in the dialogs gives: "Carried over from the week of 20 Oct" or "Week of
     * 17 Nov"; null for this week, next week, later or not planned
     */
    const otherWeek = (plannedFor: string | undefined, now: Date): string | null => {
      const week = plannedWeek(plannedFor);
      if (!week) return null;
      const horizon = planHorizon({ metadata: { plannedFor } }, now);
      const date = formatDateKey(week, now);
      if (horizon === 'carried_over') return t('planning.carriedOverFrom', { date });
      if (horizon === 'later') return t('planning.weekOf', { date });
      return null;
    };

    /**
     * The planned week as a sentence for the task's details: "Planned for this week", "Planned
     * for the week of 17 Nov", "Carried over from the week of 20 Oct"; null when not planned
     */
    const plannedFor = (value: string | undefined, now: Date): string | null => {
      const horizon = planHorizon({ metadata: { plannedFor: value } }, now);
      if (horizon === 'unplanned') return null;
      if (horizon === 'this_week' || horizon === 'next_week') return t(`planning.plannedFor.${horizon}`);
      const weekKey = plannedWeek(value);
      if (horizon === 'carried_over' || !weekKey) return otherWeek(value, now) ?? t('planning.plannedFor.later');
      return t('planning.plannedFor.weekOf', { date: formatDateKey(weekKey, now) });
    };

    return { deadline, otherWeek, plannedFor };
  }, [t]);
}
