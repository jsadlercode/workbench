/**
 * Weekly review (sidebar > Weekly review): one week at a time, Monday to Sunday, across every
 * project. The figures (src/shared/utils/weekly-review.ts), a chart of each day, where the work
 * went, what was finished and what was planned but not finished (with moves to the next week or
 * later), a reflection saved with the week's figures, and the trend of the last eight reviews.
 *
 * The data is loaded the first time the page opens in the app's session and again only from the
 * refresh button (src/renderer/stores/weekly-review-store.ts). The window's own project is read
 * from the board's task store, which is always current. A task title opens the task's details
 * when the task belongs to this window's project; other projects' tasks are shown as text.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useToday } from '../../hooks/useToday';
import { useProjectStore } from '../../stores/project-store';
import { useTaskStore } from '../../stores/task-store';
import { useWeeklyReviewStore, type WeeklyReviewDraft } from '../../stores/weekly-review-store';
import { formatDateTime } from '../../../shared/utils/format-date-time';
import { addWeeks, formatDateKey, plannedForChoice, weekStart } from '../../../shared/utils/task-planning';
import {
  isoWeekNumber,
  moveTarget,
  nextReviewWeek,
  reviewTrend,
  summarizeWeek
} from '../../../shared/utils/weekly-review';
import type { Task, WeeklyReview as WeeklyReviewRecord } from '../../../shared/types';
import { useReviewProjects } from './review-projects';
import { ReviewTiles } from './ReviewTiles';
import { DayChart } from './DayChart';
import { ProjectBreakdown } from './ProjectBreakdown';
import { FinishedList, PlannedList, type ReviewMoveChoice } from './ReviewTaskLists';
import { ReflectionForm } from './ReflectionForm';
import { TrendChart } from './TrendChart';

const NO_TASKS: Task[] = [];

/** The loaded tasks, with the projects the board's store holds taken from it instead (it is current) */
function withLiveTasks(loaded: Task[], live: Task[]): Task[] {
  if (live.length === 0) return loaded;
  const liveProjects = new Set(live.map((task) => task.projectId));
  return [...loaded.filter((task) => !liveProjects.has(task.projectId)), ...live];
}

interface ReviewSectionProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

function ReviewSection({ title, action, children }: ReviewSectionProps) {
  return (
    <section aria-label={title} className="mt-10">
      <div className="flex min-h-8 items-center justify-between gap-4">
        <h2 className="text-[0.9375rem] font-semibold leading-5 text-foreground">{title}</h2>
        {action}
      </div>
      <Card className="mt-3 p-4">{children}</Card>
    </section>
  );
}

const chipClass = 'inline-flex items-center rounded-md bg-segment-track px-2 py-0.5 text-xs text-muted-foreground';

interface WeeklyReviewProps {
  /** Opens a task's details (a task of this window's project) */
  onOpenTask: (task: Task) => void;
}

export function WeeklyReview({ onOpenTask }: WeeklyReviewProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const today = useToday();
  const thisWeek = weekStart(today);
  const [week, setWeek] = useState(thisWeek);
  const [refreshing, setRefreshing] = useState(false);

  const projects = useProjectStore((state) => state.projects);
  const windowProjectId = useProjectStore((state) => state.activeProjectId ?? state.selectedProjectId);
  const liveTasks = useTaskStore((state) => state.tasks);
  const status = useWeeklyReviewStore((state) => state.status);
  const loadFailed = useWeeklyReviewStore((state) => state.loadFailed);
  const loadedTasks = useWeeklyReviewStore((state) => state.tasks);
  const doneTimes = useWeeklyReviewStore((state) => state.doneTimes);
  const reviews = useWeeklyReviewStore((state) => state.reviews);
  const draft = useWeeklyReviewStore((state) => state.drafts[week]);
  const reviewProjects = useReviewProjects(projects, t('weeklyReview.projects.otherProject'));

  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);

  // Load once, the first time the page opens in this session (or once projects are known)
  useEffect(() => {
    if (projectIds.length > 0 && useWeeklyReviewStore.getState().status === 'idle') {
      void useWeeklyReviewStore.getState().load(projectIds);
    }
  }, [projectIds]);

  const tasks = useMemo(
    () => (status === 'ready' ? withLiveTasks(loadedTasks, liveTasks) : NO_TASKS),
    [status, loadedTasks, liveTasks]
  );
  const summary = useMemo(() => summarizeWeek(tasks, doneTimes, week, today), [tasks, doneTimes, week, today]);
  const trend = useMemo(() => reviewTrend(Object.values(reviews), thisWeek), [reviews, thisWeek]);

  const saved: WeeklyReviewRecord | undefined = reviews[week];
  const isCurrent = week === thisWeek;
  // A past week's saved review keeps the figures it was saved with
  const snapshot = saved && week < thisWeek ? saved : null;
  const target = moveTarget(week, today);
  const nextWeek = nextReviewWeek(week, today);

  const legendProjectIds = useMemo(() => {
    const ids = new Set(summary.finished.map((item) => item.task.projectId));
    const ordered = projects.map((project) => project.id).filter((id) => ids.has(id));
    // Tasks of a project that is no longer in the list come last
    return [...ordered, ...[...ids].filter((id) => !ordered.includes(id))];
  }, [summary.finished, projects]);

  const canOpen = (task: Task) => task.projectId === windowProjectId;
  const openTask = (task: Task) => {
    const live = useTaskStore.getState().tasks.find((t) => t.id === task.id && t.projectId === task.projectId);
    onOpenTask(live ?? task);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await useWeeklyReviewStore.getState().load(projectIds);
    } finally {
      setRefreshing(false);
    }
  };

  const handleMove = async (task: Task, choice: ReviewMoveChoice): Promise<boolean> => {
    const plannedFor = plannedForChoice(choice, new Date());
    const result = await window.electronAPI.updateTask(task.id, { metadata: { plannedFor } }, task.projectId);
    if (!result.success || !result.data) return false;
    // The task as saved, with the weeks it slipped from (recorded by the main process)
    useWeeklyReviewStore.getState().replaceTask(result.data);
    const taskStore = useTaskStore.getState();
    if (taskStore.tasks.some((t) => t.id === task.id && t.projectId === task.projectId)) {
      taskStore.updateTask(task.id, { metadata: result.data.metadata });
    }
    return true;
  };

  const handleDraftChange = (next: WeeklyReviewDraft) => useWeeklyReviewStore.getState().setDraft(week, next);

  const handleSave = (fields: WeeklyReviewDraft): Promise<boolean> =>
    useWeeklyReviewStore.getState().saveReview({
      weekStart: week,
      ...fields,
      // Saved again later, a past week keeps the figures of its first save
      stats: snapshot ? snapshot.stats : summary.stats,
      savedAt: new Date().toISOString()
    });

  const header = (
    <>
      <div className="mb-6 flex items-center gap-2">
        <h1 className="flex-1 font-heading text-[2rem] font-normal! leading-tight tracking-tight text-foreground">
          {t('weeklyReview.title')}
        </h1>
        {projects.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void handleRefresh()}
            disabled={refreshing || status === 'loading'}
            aria-label={t('weeklyReview.refresh')}
            title={t('weeklyReview.refresh')}
            className="h-8 w-8 text-muted-foreground hover:bg-nav-hover hover:text-foreground"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} strokeWidth={1.75} />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setWeek((current) => addWeeks(current, -1) ?? current)}
            aria-label={t('weeklyReview.previousWeek')}
            title={t('weeklyReview.previousWeek')}
            className="h-8 w-8 text-muted-foreground hover:bg-nav-hover hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => nextWeek && setWeek(nextWeek)}
            disabled={!nextWeek}
            aria-label={t('weeklyReview.nextWeek')}
            title={t('weeklyReview.nextWeek')}
            className="h-8 w-8 text-muted-foreground hover:bg-nav-hover hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="text-lg font-semibold text-foreground">{t('weeklyReview.weekOf', { date: formatDateKey(week, today) })}</h2>
        <span className={chipClass}>{t('weeklyReview.weekNumber', { number: isoWeekNumber(week) })}</span>
        {isCurrent ? (
          <span className={cn(chipClass, 'bg-primary/10 text-primary')}>{t('weeklyReview.thisWeek')}</span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeek(thisWeek)}
            className="ml-auto h-8 px-2.5 text-[0.8125rem] text-muted-foreground hover:bg-nav-hover hover:text-foreground"
          >
            {t('weeklyReview.backToThisWeek')}
          </Button>
        )}
      </div>
    </>
  );

  if (projects.length === 0 || status !== 'ready') {
    return (
      <ScrollArea className="h-full">
        <div className="mx-auto w-full max-w-4xl px-8 pb-12 pt-14">
          {header}
          <div className="mt-16 flex items-center justify-center gap-2 text-sm text-(--nav-label-color)">
            {projects.length === 0 ? (
              t('weeklyReview.noProjects')
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('weeklyReview.loading')}
              </>
            )}
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto w-full max-w-4xl px-8 pb-12 pt-14">
        {header}

        {/* While a refresh runs, the page keeps what it shows, dimmed */}
        <div className={cn('transition-opacity', refreshing && 'opacity-60')}>
          {loadFailed && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {t('weeklyReview.loadFailed')}
            </p>
          )}

          <div className="mt-6">
            <ReviewTiles
              stats={snapshot ? snapshot.stats : summary.stats}
              focus={snapshot ? null : summary.focus}
              isCurrent={isCurrent}
            />
            {snapshot && (
              <p className="mt-2 text-xs text-(--nav-label-color)">
                {t('weeklyReview.snapshotNote', { time: formatDateTime(snapshot.savedAt) })}
              </p>
            )}
          </div>

          <ReviewSection title={t('weeklyReview.days.title')}>
            <DayChart
              days={summary.days}
              projects={reviewProjects}
              legendProjectIds={legendProjectIds}
              isCurrent={isCurrent}
            />
          </ReviewSection>

          <ReviewSection title={t('weeklyReview.projects.title')}>
            <ProjectBreakdown rows={summary.projects} projects={reviewProjects} isCurrent={isCurrent} />
          </ReviewSection>

          <ReviewSection title={t('weeklyReview.finished.title')}>
            <FinishedList
              items={summary.finished}
              projects={reviewProjects}
              isCurrent={isCurrent}
              canOpen={canOpen}
              onOpen={openTask}
            />
          </ReviewSection>

          <ReviewSection title={t(isCurrent ? 'weeklyReview.planned.titleThisWeek' : 'weeklyReview.planned.title')}>
            <PlannedList
              // A new list per week, so moves under way and their errors stay with their week
              key={week}
              items={summary.plannedOpen}
              projects={reviewProjects}
              isCurrent={isCurrent}
              target={target}
              today={today}
              onMove={handleMove}
              canOpen={canOpen}
              onOpen={openTask}
            />
          </ReviewSection>

          <ReviewSection title={t('weeklyReview.reflection.title')}>
            <ReflectionForm key={week} saved={saved} draft={draft} onDraftChange={handleDraftChange} onSave={handleSave} />
          </ReviewSection>

          <ReviewSection title={t('weeklyReview.trend.title')}>
            <TrendChart weeks={trend} viewedWeek={week} today={today} />
          </ReviewSection>
        </div>
      </div>
    </ScrollArea>
  );
}
