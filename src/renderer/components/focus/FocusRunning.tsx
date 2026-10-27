/**
 * Focus mode while the timer runs or is paused: the ring with the time left, the controls, the
 * task's "your steps" to tick off, and the field that parks stray thoughts in the Backlog.
 */
import { useTranslation } from 'react-i18next';
import { Pause, Play, Plus, Square } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { YourSteps } from '../task-detail/YourSteps';
import { ParkThought } from './ParkThought';
import { useFocusClock } from '../../hooks/useFocusClock';
import { useTaskStore } from '../../stores/task-store';
import { useFocusStore, type FocusTimer } from '../../stores/focus-store';
import { focusClock, formatFocusClock } from '../../../shared/utils/focus';

const RING_SIZE = 288;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface FocusRingProps {
  /** Time focused of the session, 0 to 1 */
  progress: number;
  paused: boolean;
  children: React.ReactNode;
}

/** A ring that fills clockwise from the top as the session goes */
function FocusRing({ progress, paused, children }: FocusRingProps) {
  return (
    <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg
        aria-hidden="true"
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="-rotate-90"
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-segment-track"
        />
        <circle
          data-testid="focus-ring-progress"
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)))}
          className={cn(
            'transition-[stroke-dashoffset,stroke] duration-1000 ease-linear motion-reduce:transition-none',
            paused ? 'stroke-(--nav-label-color)' : 'stroke-primary'
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

interface FocusRunningProps {
  timer: FocusTimer;
}

export function FocusRunning({ timer }: FocusRunningProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const now = useFocusClock(timer);
  const task = useTaskStore((state) =>
    state.tasks.find((candidate) => candidate.id === timer.taskId && candidate.projectId === timer.projectId)
  );
  const pause = useFocusStore((state) => state.pause);
  const resume = useFocusStore((state) => state.resume);
  const extend = useFocusStore((state) => state.extend);
  const stop = useFocusStore((state) => state.stop);

  const paused = timer.pausedAt !== null;
  const clock = focusClock(timer, now);
  const time = formatFocusClock(clock.remainingMs);
  const plannedMinutes = timer.lengthMinutes + timer.addedMinutes;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8 px-6 pb-12 pt-2">
      <h2 className="max-w-full text-center text-xl font-medium text-foreground wrap-anywhere">
        {task?.title ?? timer.taskTitle}
      </h2>

      <FocusRing progress={clock.progress} paused={paused}>
        <span
          role="timer"
          aria-label={t('focus.running.timeLeft', { time })}
          className="text-6xl font-light tabular-nums tracking-tight text-foreground"
        >
          {time}
        </span>
        <span className={cn('mt-2 text-sm', paused ? 'text-foreground' : 'text-(--nav-label-color)')}>
          {paused ? t('focus.running.paused') : t('focus.running.of', { count: plannedMinutes })}
        </span>
      </FocusRing>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button data-focus-initial onClick={() => (paused ? resume() : pause())} className="min-w-28 gap-2 px-4">
          {paused ? (
            <Play className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Pause className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          )}
          {paused ? t('focus.running.resume') : t('focus.running.pause')}
        </Button>
        <Button variant="outline" onClick={extend} aria-label={t('focus.running.extendLabel')} className="gap-1.5 px-4">
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {t('focus.running.extend')}
        </Button>
        <Button variant="ghost" onClick={() => stop()} className="gap-2 px-4">
          <Square className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          {t('focus.running.stop')}
        </Button>
      </div>

      {task && (
        <div className="w-full">
          <YourSteps task={task} hideDescription />
        </div>
      )}

      <ParkThought projectId={timer.projectId} />
    </div>
  );
}
