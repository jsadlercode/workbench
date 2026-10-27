/**
 * Waiting on: the project's tasks waiting on someone or something (src/shared/utils/waiting.ts),
 * longest waiting first, each with who or what it waits on, for how long, and a Stop waiting
 * button. Shown below Up next only while a task waits, so they don't get lost in their columns.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Hourglass, Loader2 } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { useToday } from '../hooks/useToday';
import { useWaitingBarStore } from '../stores/waiting-store';
import { setTaskWaiting } from '../stores/task-store';
import { listWaiting, waitingDays } from '../../shared/utils/waiting';
import type { Task } from '../../shared/types';

/** Tasks shown before "Show all" */
const VISIBLE_COUNT = 3;

interface WaitingBarProps {
  /** The board's tasks (done and archived ones are left out) */
  tasks: Task[];
  /** Opens the task's details, like a card click */
  onTaskClick: (task: Task) => void;
}

export function WaitingBar({ tasks, onTaskClick }: WaitingBarProps) {
  const { t } = useTranslation('tasks');
  // Days are counted against today, which moves on at midnight
  const today = useToday();
  const waiting = useMemo(() => listWaiting(tasks), [tasks]);
  const collapsed = useWaitingBarStore((state) => state.collapsed);
  const setCollapsed = useWaitingBarStore((state) => state.setCollapsed);
  const [showAll, setShowAll] = useState(false);
  // Tasks being taken off the list, and the ones that failed
  const [stopping, setStopping] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

  if (waiting.length === 0) return null;

  const count = waiting.length;
  const visible = showAll ? waiting : waiting.slice(0, VISIBLE_COUNT);

  const without = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    next.delete(id);
    return next;
  };

  const handleStopWaiting = async (task: Task) => {
    setStopping((prev) => new Set(prev).add(task.id));
    setFailed((prev) => without(prev, task.id));
    const saved = await setTaskWaiting(task.id, '');
    if (!saved) setFailed((prev) => new Set(prev).add(task.id));
    setStopping((prev) => without(prev, task.id));
  };

  const durationText = (task: Task): string | null => {
    const days = waitingDays(task, today);
    if (days === null) return null;
    return days === 0 ? t('waiting.bar.sinceToday') : t('waiting.bar.forDays', { count: days });
  };

  if (collapsed) {
    return (
      <section aria-label={t('waiting.bar.title')} className="px-6 pt-2">
        <Card>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-expanded={false}
            title={t('waiting.bar.expand')}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-nav-hover"
          >
            <Hourglass className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span className="font-semibold text-foreground">{t('waiting.bar.title')}</span>
            <span className="text-(--nav-label-color)" aria-hidden="true">·</span>
            <span className="text-muted-foreground">{t('waiting.bar.count', { count })}</span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label={t('waiting.bar.title')} className="px-6 pt-2">
      <Card className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-2">
          <Hourglass className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{t('waiting.bar.title')}</h2>
          <span className="shrink-0 text-xs text-muted-foreground">{t('waiting.bar.count', { count })}</span>
          <span className="text-xs text-(--nav-label-color)" aria-hidden="true">·</span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{t('waiting.bar.hint')}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {count > VISIBLE_COUNT && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll((prev) => !prev)}
                aria-expanded={showAll}
                className="h-7 text-[0.8125rem] text-muted-foreground hover:bg-nav-hover hover:text-foreground"
              >
                {showAll ? t('waiting.bar.showLess') : t('waiting.bar.showAll', { total: count })}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(true)}
              aria-expanded={true}
              aria-label={t('waiting.bar.collapse')}
              title={t('waiting.bar.collapse')}
              className="h-7 w-7 text-muted-foreground hover:bg-nav-hover hover:text-foreground"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((task) => {
            const busy = stopping.has(task.id);
            const waitingOn = task.metadata?.waitingOn?.trim() ?? '';
            const duration = durationText(task);
            return (
              <li key={task.id} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onTaskClick(task)}
                    title={task.title}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline"
                  >
                    {task.title}
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleStopWaiting(task)}
                    disabled={busy}
                    aria-label={t('waiting.bar.stopWaitingAriaLabel', { waitingOn, title: task.title })}
                    className="h-7 shrink-0 gap-1 px-2"
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    {t('waiting.bar.stopWaiting')}
                  </Button>
                </div>
                <p className="flex min-w-0 items-center gap-1.5 text-xs">
                  <Hourglass className="h-3 w-3 shrink-0 text-warning" strokeWidth={2} aria-hidden="true" />
                  <span className="min-w-0 truncate text-warning" title={waitingOn}>{waitingOn}</span>
                  {duration && <span className="shrink-0 text-muted-foreground">{duration}</span>}
                </p>
                {failed.has(task.id) && (
                  <p role="alert" className="text-xs text-destructive wrap-anywhere">
                    {t('waiting.saveFailed')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
