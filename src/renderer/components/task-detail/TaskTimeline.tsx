/**
 * The task's timeline in its details: what happened to it, newest first (taskTimeline): when it
 * was added, the states it entered (the project's task changelog), the changes made to it and its
 * focus sessions. The newest 12 show, the rest behind "Show all". Claude Code's entries say so.
 *
 * The state entries come from the project's history cache (task-history-store), loaded the first
 * time and again when the task's status changes; the other entries show while it loads, and when
 * it fails.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { useFocusDuration } from '../focus/useFocusDuration';
import { useTaskHistoryStore } from '../../stores/task-history-store';
import { taskTimeline, type TimelineEvent } from '../../../shared/utils/task-timeline';
import { formatShortDateTime } from '../../../shared/utils/format-date-time';
import { PLAN_LATER, formatDateKey, plannedWeek } from '../../../shared/utils/task-planning';
import type { Task, TaskActivity } from '../../../shared/types';

/** Entries shown before "Show all" */
export const TIMELINE_VISIBLE_COUNT = 12;

/**
 * How long after a status change the history is loaded again: the changelog's entry is written
 * a moment after the change (once the branch's changed files are listed)
 */
const STATUS_SETTLE_MS = 1500;

const EMPTY_HISTORY: never[] = [];

interface TimelineRow {
  key: string;
  at: string;
  text: string;
  detail?: string;
  byClaudeCode: boolean;
}

export function TaskTimeline({ task }: { task: Task }) {
  const { t } = useTranslation('tasks');
  const duration = useFocusDuration();
  const history = useTaskHistoryStore((state) => state.byProject[task.projectId]);
  const ensure = useTaskHistoryStore((state) => state.ensure);
  const [showAll, setShowAll] = useState(false);

  // Load the history when the details open, and again shortly after the task's status changes
  const seen = useRef<{ id: string; status: Task['status'] } | null>(null);
  useEffect(() => {
    const changedWhileOpen = seen.current?.id === task.id && seen.current.status !== task.status;
    seen.current = { id: task.id, status: task.status };
    if (!changedWhileOpen) {
      void ensure(task.projectId, task.id, task.status);
      return;
    }
    const timer = setTimeout(() => void ensure(task.projectId, task.id, task.status), STATUS_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ensure, task.projectId, task.id, task.status]);

  const entries = history?.entries ?? EMPTY_HISTORY;
  const events = useMemo(
    () => taskTimeline({ specId: task.specId, createdAt: task.createdAt, metadata: task.metadata }, entries),
    [task.specId, task.createdAt, task.metadata, entries]
  );

  const now = new Date();

  const activityText = (activity: TaskActivity): string => {
    switch (activity.kind) {
      case 'planned': {
        if (activity.value === PLAN_LATER) return t('timeline.activity.plannedLater');
        const week = plannedWeek(activity.value);
        return week ? t('timeline.activity.plannedWeek', { date: formatDateKey(week, now) }) : t('timeline.activity.unplanned');
      }
      case 'deadline': {
        const date = formatDateKey(activity.value, now);
        if (!date) return t('timeline.activity.deadlineCleared');
        return activity.hard ? t('timeline.activity.hardDeadline', { date }) : t('timeline.activity.deadline', { date });
      }
      case 'flagged':
        return t('timeline.activity.flagged');
      case 'unflagged':
        return t('timeline.activity.unflagged');
      case 'waiting':
        return t('timeline.activity.waiting', { waitingOn: activity.value ?? '' });
      case 'stopped_waiting':
        return t('timeline.activity.stoppedWaiting');
      case 'step_done':
        return t('timeline.activity.stepDone', { step: activity.value ?? '' });
      case 'step_reopened':
        return t('timeline.activity.stepReopened', { step: activity.value ?? '' });
      case 'renamed':
        return t('timeline.activity.renamed', { title: activity.value ?? '' });
      case 'parked':
        return activity.value
          ? t('timeline.activity.parked', { title: activity.value })
          : t('timeline.activity.parkedNoTask');
      default:
        return '';
    }
  };

  const toRow = (event: TimelineEvent, index: number): TimelineRow | null => {
    const key = `${event.type}-${event.at}-${index}`;
    switch (event.type) {
      case 'created':
        return { key, at: event.at, text: t('timeline.created'), byClaudeCode: false };
      case 'state': {
        const name = event.state === 'human_review' && event.byClaudeCode ? 'human_review_run' : event.state;
        return { key, at: event.at, text: t(`timeline.states.${name}`), byClaudeCode: event.byClaudeCode };
      }
      case 'activity': {
        const text = activityText(event.activity);
        return text ? { key, at: event.at, text, byClaudeCode: false } : null;
      }
      case 'focus': {
        const { session } = event;
        const outcome = t(`timeline.outcomes.${session.outcome}`);
        return {
          key,
          at: event.at,
          text: t('timeline.focusSession', { duration: duration(session.focusedSeconds), outcome }),
          detail: session.note?.trim() || undefined,
          byClaudeCode: false
        };
      }
    }
  };

  const rows = events.map(toRow).filter((row): row is TimelineRow => row !== null);
  if (rows.length === 0) return null;
  const visible = showAll ? rows : rows.slice(0, TIMELINE_VISIBLE_COUNT);

  return (
    <section aria-labelledby={`task-timeline-${task.id}`}>
      <h3 id={`task-timeline-${task.id}`} className="mb-2 text-sm text-foreground">
        {t('timeline.title')}
      </h3>

      <ol className="space-y-0.5">
        {visible.map((row) => (
          <li key={row.key} className="flex items-baseline gap-3 px-1 py-1 text-sm">
            <time dateTime={row.at} className="w-28 shrink-0 text-xs tabular-nums text-(--nav-label-color)">
              {formatShortDateTime(row.at, now)}
            </time>
            <div className="min-w-0 flex-1">
              <p className="text-foreground wrap-anywhere">
                <span>{row.text}</span>
                {row.byClaudeCode && <span className="ml-2 text-xs text-primary">{t('timeline.claudeCode')}</span>}
              </p>
              {row.detail && <p className="mt-0.5 text-xs text-(--nav-label-color) wrap-anywhere">{row.detail}</p>}
            </div>
          </li>
        ))}
      </ol>

      {rows.length > TIMELINE_VISIBLE_COUNT && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll((prev) => !prev)}
          aria-expanded={showAll}
          className="mt-1 h-7 text-[0.8125rem] text-muted-foreground hover:bg-nav-hover hover:text-foreground"
        >
          {showAll ? t('timeline.showLess') : t('timeline.showAll', { total: rows.length })}
        </Button>
      )}

      {history?.status === 'failed' && (
        <p className="mt-1 px-1 text-xs text-(--nav-label-color)">{t('timeline.loadFailed')}</p>
      )}
    </section>
  );
}
