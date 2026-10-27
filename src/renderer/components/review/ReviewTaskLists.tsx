/**
 * The weekly review's task lists: Finished (with its project, Unplanned and the day), and Planned
 * but not finished (Planned and still open for this week), whose open tasks move to the next
 * week the review offers (next week from this week, this week from a past one) or to later, one
 * at a time or all at once. A title opens the task when it belongs to this window's project.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { formatShortDate } from '../../../shared/utils/format-date-time';
import { planChoiceOf, planHorizon, PLAN_LATER, type PlanChoice } from '../../../shared/utils/task-planning';
import { taskKey, type FinishedTask, type PlannedOpenTask } from '../../../shared/utils/weekly-review';
import type { Task } from '../../../shared/types';
import { weekdayName, type ReviewProjects } from './review-projects';

/** Where a move sends a task */
export type ReviewMoveChoice = Extract<PlanChoice, 'this_week' | 'next_week' | 'later'>;

const chipClass = 'inline-flex max-w-full items-center gap-1 rounded-md bg-segment-track px-1.5 py-0.5 text-[0.6875rem] leading-4 text-muted-foreground';

function ProjectChip({ projectId, projects }: { projectId: string; projects: ReviewProjects }) {
  const name = projects.name(projectId);
  return (
    <span className={chipClass} title={name}>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: projects.color(projectId) }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

interface TaskTitleProps {
  task: Task;
  canOpen: (task: Task) => boolean;
  onOpen: (task: Task) => void;
}

function TaskTitle({ task, canOpen, onOpen }: TaskTitleProps) {
  if (!canOpen(task)) {
    return (
      <span className="min-w-0 truncate text-sm text-foreground" title={task.title}>
        {task.title}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      title={task.title}
      className="min-w-0 truncate text-left text-sm text-foreground hover:underline"
    >
      {task.title}
    </button>
  );
}

interface FinishedListProps extends Omit<TaskTitleProps, 'task'> {
  items: FinishedTask<Task>[];
  projects: ReviewProjects;
  isCurrent: boolean;
}

export function FinishedList({ items, projects, isCurrent, canOpen, onOpen }: FinishedListProps) {
  const { t } = useTranslation('tasks');
  if (items.length === 0) {
    return (
      <p className="text-sm text-(--nav-label-color)">
        {t(isCurrent ? 'weeklyReview.finished.emptyThisWeek' : 'weeklyReview.finished.empty')}
      </p>
    );
  }
  return (
    <ul aria-label={t('weeklyReview.finished.title')} className="flex flex-col divide-y divide-settings-divider">
      {items.map((item) => (
        <li key={taskKey(item.task)} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-2 first:pt-0 last:pb-0">
          <TaskTitle task={item.task} canOpen={canOpen} onOpen={onOpen} />
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
            <ProjectChip projectId={item.task.projectId} projects={projects} />
            {!item.planned && <span className={chipClass}>{t('weeklyReview.finished.unplanned')}</span>}
            <span className={cn(chipClass, 'tabular-nums')}>{weekdayName(new Date(item.finishedAt))}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface PlannedListProps extends Omit<TaskTitleProps, 'task'> {
  items: PlannedOpenTask<Task>[];
  projects: ReviewProjects;
  isCurrent: boolean;
  /** Where "Move all" and the first move button send tasks */
  target: Extract<ReviewMoveChoice, 'this_week' | 'next_week'>;
  today: Date;
  /** Move a task; resolves to whether it was saved */
  onMove: (task: Task, choice: ReviewMoveChoice) => Promise<boolean>;
}

/** Whether a task can be moved from the list: still open */
const isMovable = (item: PlannedOpenTask<Task>) => item.finishedAt === null && item.task.status !== 'done';

export function PlannedList({ items, projects, isCurrent, target, today, onMove, canOpen, onOpen }: PlannedListProps) {
  const { t } = useTranslation('tasks');
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [movingAll, setMovingAll] = useState(false);

  const isAt = (task: Task, choice: ReviewMoveChoice): boolean =>
    choice === 'later' ? task.metadata?.plannedFor === PLAN_LATER : planChoiceOf(task.metadata?.plannedFor, today) === choice;
  const toMove = items.filter((item) => isMovable(item) && !isAt(item.task, target));

  const move = async (task: Task, choice: ReviewMoveChoice): Promise<boolean> => {
    const key = taskKey(task);
    setBusy((prev) => new Set(prev).add(key));
    setFailed((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    const saved = await onMove(task, choice).catch(() => false);
    setBusy((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (!saved) setFailed((prev) => new Set(prev).add(key));
    return saved;
  };

  const moveAll = async () => {
    setMovingAll(true);
    // One after another, so the saves don't race each other on disk
    for (const item of toMove) await move(item.task, target);
    setMovingAll(false);
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-(--nav-label-color)">
        {t(isCurrent ? 'weeklyReview.planned.emptyThisWeek' : 'weeklyReview.planned.empty')}
      </p>
    );
  }

  const targetLabel = t(target === 'next_week' ? 'weeklyReview.planned.nextWeek' : 'weeklyReview.planned.thisWeek');
  const moveAllLabel = t(target === 'next_week' ? 'weeklyReview.planned.moveAllNext' : 'weeklyReview.planned.moveAllThis');

  return (
    <div>
      <ul
        aria-label={t(isCurrent ? 'weeklyReview.planned.titleThisWeek' : 'weeklyReview.planned.title')}
        className="flex flex-col divide-y divide-settings-divider"
      >
        {items.map((item) => {
          const { task } = item;
          const key = taskKey(task);
          const movable = isMovable(item);
          const horizon = planHorizon(task, today);
          const isBusy = busy.has(key);
          return (
            <li key={key} className="flex min-w-0 flex-col gap-1 py-2 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <TaskTitle task={task} canOpen={canOpen} onOpen={onOpen} />
                <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
                  <ProjectChip projectId={task.projectId} projects={projects} />
                  {item.finishedAt !== null ? (
                    <span className={chipClass}>
                      {t('weeklyReview.planned.doneOn', { date: formatShortDate(new Date(item.finishedAt), today) })}
                    </span>
                  ) : (
                    // Where it is planned now; nothing to add for this week's own tasks
                    !(isCurrent && horizon === 'this_week') && <span className={chipClass}>{t(`planning.groups.${horizon}`)}</span>
                  )}
                  {movable && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void move(task, target)}
                        disabled={isBusy || movingAll || isAt(task, target)}
                        aria-label={t(target === 'next_week' ? 'weeklyReview.planned.moveToNextWeek' : 'weeklyReview.planned.moveToThisWeek', { title: task.title })}
                        className="h-7 gap-1 px-2"
                      >
                        {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                        {targetLabel}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void move(task, 'later')}
                        disabled={isBusy || movingAll || isAt(task, 'later')}
                        aria-label={t('weeklyReview.planned.moveToLater', { title: task.title })}
                        className="h-7 px-2"
                      >
                        {t('weeklyReview.planned.later')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {failed.has(key) && (
                <p role="alert" className="text-xs text-destructive">
                  {t('weeklyReview.planned.moveFailed')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {toMove.length > 0 && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => void moveAll()} disabled={movingAll} className="h-8 gap-1.5 px-3">
            {movingAll && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {moveAllLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
