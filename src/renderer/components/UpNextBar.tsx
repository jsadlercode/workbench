/**
 * Up next: the Backlog tasks worth handing to agents now (src/shared/utils/up-next.ts), each with
 * the reasons it was picked and a button that moves it to the Queue. The Queue then starts tasks
 * itself up to the parallel limit. Shown above the board's columns only while there is a
 * suggestion, so a project that doesn't plan never sees it.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CalendarDays, ChevronDown, ChevronUp, Flag, History, Hourglass, ListStart, Loader2, type LucideIcon } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { useToday } from '../hooks/useToday';
import { useUpNextStore } from '../stores/up-next-store';
import { suggestUpNext, type UpNextReason, type UpNextReasonKey, type UpNextTone } from '../../shared/utils/up-next';
import type { Task } from '../../shared/types';

/** Suggestions shown before "Show all" */
const VISIBLE_COUNT = 3;
/** The most the bar lists */
const MAX_COUNT = 10;

// Reason badge colors, in the task card's deadline badge look (color text and border, 10% tint)
const TONE_CLASS: Record<UpNextTone, string> = {
  urgent: 'border-current bg-destructive/10 text-destructive',
  soon: 'border-current bg-warning/10 text-warning',
  accent: 'border-current bg-primary/10 text-primary',
  neutral: 'border-border text-(--nav-label-color)'
};

const REASON_ICON: Record<UpNextReasonKey, LucideIcon> = {
  carried_over: History,
  overdue: CalendarClock,
  past_target: CalendarClock,
  due_today: CalendarClock,
  due_in_days: CalendarClock,
  flagged: Flag,
  this_week: CalendarDays,
  next_week: CalendarDays,
  waiting: Hourglass
};

interface UpNextBarProps {
  /** The Backlog's tasks in the order the column shows them (it breaks ties) */
  backlog: Task[];
  /** Opens the task's details, like a card click */
  onTaskClick: (task: Task) => void;
  /** Moves the task to the Queue the way dragging it there does; resolves to why it failed, or null */
  onQueue: (task: Task) => Promise<string | null>;
}

export function UpNextBar({ backlog, onTaskClick, onQueue }: UpNextBarProps) {
  const { t } = useTranslation(['tasks', 'common']);
  // Planned weeks and deadlines are read against today, which moves on at midnight
  const today = useToday();
  const suggestions = useMemo(() => suggestUpNext(backlog, today).slice(0, MAX_COUNT), [backlog, today]);
  const collapsed = useUpNextStore((state) => state.collapsed);
  const setCollapsed = useUpNextStore((state) => state.setCollapsed);
  const [showAll, setShowAll] = useState(false);
  // Tasks being moved to the Queue, and why a move failed
  const [queueing, setQueueing] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  if (suggestions.length === 0) return null;

  const count = suggestions.length;
  const visible = showAll ? suggestions : suggestions.slice(0, VISIBLE_COUNT);

  const handleQueue = async (task: Task) => {
    setQueueing((prev) => new Set(prev).add(task.id));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    const error = await onQueue(task).catch((err: unknown) =>
      err instanceof Error ? err.message : t('common:errors.unknownError')
    );
    if (error) setErrors((prev) => ({ ...prev, [task.id]: error }));
    setQueueing((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });
  };

  const reasonText = (reason: UpNextReason): string =>
    reason.key === 'due_in_days'
      ? t('upNext.reasons.due_in_days', { count: reason.days })
      : t(`upNext.reasons.${reason.key}`);

  if (collapsed) {
    return (
      <section aria-label={t('upNext.title')} className="px-6 pt-2">
        <Card>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-expanded={false}
            title={t('upNext.expand')}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-nav-hover"
          >
            <ListStart className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="font-semibold text-foreground">{t('upNext.title')}</span>
            <span className="text-(--nav-label-color)" aria-hidden="true">·</span>
            <span className="text-muted-foreground">{t('upNext.suggestions', { count })}</span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label={t('upNext.title')} className="px-6 pt-2">
      <Card className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-2">
          <ListStart className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">{t('upNext.title')}</h2>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{t('upNext.hint')}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {count > VISIBLE_COUNT && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll((prev) => !prev)}
                aria-expanded={showAll}
                className="h-7 text-[0.8125rem] text-muted-foreground hover:bg-nav-hover hover:text-foreground"
              >
                {showAll ? t('upNext.showLess') : t('upNext.showAll', { total: count })}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(true)}
              aria-expanded={true}
              aria-label={t('upNext.collapse')}
              title={t('upNext.collapse')}
              className="h-7 w-7 text-muted-foreground hover:bg-nav-hover hover:text-foreground"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ task, reasons }) => {
            const busy = queueing.has(task.id);
            const error = errors[task.id];
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
                    size="sm"
                    onClick={() => void handleQueue(task)}
                    disabled={busy}
                    aria-label={t('upNext.queueAriaLabel', { title: task.title })}
                    className="h-7 shrink-0 gap-1 px-2"
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    {t('upNext.queue')}
                  </Button>
                </div>
                {reasons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {reasons.map((reason) => {
                      const Icon = REASON_ICON[reason.key];
                      return (
                        <Badge key={reason.key} variant="outline" className={cn('gap-1.5 text-xs', TONE_CLASS[reason.tone])}>
                          <Icon className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
                          {reasonText(reason)}
                        </Badge>
                      );
                    })}
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-xs text-destructive wrap-anywhere">
                    {t('upNext.queueFailed', { error })}
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
