/**
 * Each day of the week, Monday to Sunday: a column of the tasks finished that day, one block per
 * task in its project's color (the first one finished at the bottom), the count above it, and the
 * day's focus time under the day. Today's column is highlighted. Hovering a block names the task
 * and its project; the Finished list under the chart holds the same tasks as text.
 */
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useFocusDuration } from '../focus/useFocusDuration';
import { parseDateKey } from '../../../shared/utils/task-planning';
import type { ReviewDay } from '../../../shared/utils/weekly-review';
import type { Task } from '../../../shared/types';
import { weekdayName, type ReviewProjects } from './review-projects';

/** Height the blocks can take (px) */
const PLOT_HEIGHT = 128;
/** Room for the count above the tallest column (px) */
const COUNT_HEIGHT = 20;
/** Surface gap between blocks (px) */
const GAP = 2;
const MAX_BLOCK = 16;
const MIN_BLOCK = 3;

interface DayChartProps {
  days: ReviewDay<Task>[];
  projects: ReviewProjects;
  /** The projects of the week's finished tasks, in the project list's order, for the legend */
  legendProjectIds: string[];
  isCurrent: boolean;
}

export function DayChart({ days, projects, legendProjectIds, isCurrent }: DayChartProps) {
  const { t } = useTranslation('tasks');
  const duration = useFocusDuration();
  const most = Math.max(1, ...days.map((day) => day.tasks.length));
  // Blocks shrink to fit a busy day, never below a sliver
  const block = Math.max(MIN_BLOCK, Math.min(MAX_BLOCK, Math.floor((PLOT_HEIGHT - GAP * (most - 1)) / most)));
  const empty = days.every((day) => day.tasks.length === 0);

  return (
    <figure className="m-0" aria-label={t('weeklyReview.days.label')}>
      <div className="relative flex">
        {days.map((day) => {
          const date = parseDateKey(day.date) ?? new Date();
          const weekday = weekdayName(date);
          const count = day.tasks.length;
          const focus = day.focusSeconds > 0 ? duration(day.focusSeconds) : null;
          const summary = t('weeklyReview.days.daySummary', {
            day: `${weekday} ${date.getDate()}`,
            finished: t('weeklyReview.days.finished', { count }),
            focus: focus ? t('weeklyReview.days.focusTime', { duration: focus }) : t('weeklyReview.days.noFocus')
          });
          return (
            <div
              key={day.date}
              role="group"
              aria-label={summary}
              title={summary}
              data-review-day={day.date}
              className={cn('flex min-w-0 flex-1 flex-col rounded-lg pt-1', day.isToday && 'bg-segment-track')}
            >
              <div
                className="flex flex-col items-center justify-end border-b border-border"
                style={{ height: PLOT_HEIGHT + COUNT_HEIGHT }}
              >
                {count > 0 && (
                  <span aria-hidden="true" className="mb-1 text-xs font-medium leading-4 text-foreground tabular-nums">
                    {count}
                  </span>
                )}
                {/* Bottom up: the first task finished sits on the baseline, the top block gets the round end */}
                <div className="flex w-[calc(100%-4px)] max-w-6 flex-col-reverse" style={{ gap: GAP }}>
                  {day.tasks.map((task, index) => (
                    <div
                      key={`${task.projectId}/${task.id}`}
                      title={`${task.title} · ${projects.name(task.projectId)}`}
                      data-review-block={task.id}
                      className={cn('w-full', index === count - 1 && 'rounded-t-[4px]')}
                      style={{ height: block, backgroundColor: projects.color(task.projectId) }}
                    />
                  ))}
                </div>
              </div>
              <div aria-hidden="true" className="flex flex-col items-center gap-0.5 pb-1.5 pt-1.5 text-center leading-none">
                <span className={cn('text-xs', day.isToday ? 'font-semibold text-foreground' : 'text-(--nav-label-color)')}>
                  {weekday} {date.getDate()}
                </span>
                <span className="min-h-3 text-[0.6875rem] text-(--nav-label-color) tabular-nums">{focus ?? ''}</span>
              </div>
            </div>
          );
        })}
        {empty && (
          <p
            className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center text-xs text-(--nav-label-color)"
            style={{ height: PLOT_HEIGHT + COUNT_HEIGHT }}
          >
            {t(isCurrent ? 'weeklyReview.days.emptyThisWeek' : 'weeklyReview.days.empty')}
          </p>
        )}
      </div>

      {/* A legend whenever more than one project's color is in play */}
      {legendProjectIds.length > 1 && (
        <ul aria-label={t('weeklyReview.days.legend')} className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {legendProjectIds.map((projectId) => (
            <li key={projectId} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: projects.color(projectId) }} />
              <span className="truncate">{projects.name(projectId)}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
