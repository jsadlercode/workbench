/**
 * Focus mode: a full-screen timer on one task. Three screens: the picker (length and task), the
 * running timer (with the task's "your steps" and a field that parks stray thoughts in the
 * Backlog), and "How did that go?" once it ends, which logs the session on the task.
 *
 * Always mounted (App.tsx), so time running out is caught while the overlay is hidden: it chimes
 * and shows the overlay again. Esc and Hide only hide it; the timer keeps running and the sidebar's
 * Focus row shows the time left. The screen is kept awake while the timer runs.
 *
 * The overlay is a modal dialog, so it traps the focus and the board's N shortcut stands down.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Minimize2 } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { TITLE_BAR_STRIP_HEIGHT } from '../../lib/title-bar';
import { FocusPicker } from './FocusPicker';
import { FocusRunning } from './FocusRunning';
import { FocusEnded } from './FocusEnded';
import { playFocusChime } from './chime';
import { useScreenWakeLock } from '../../hooks/useScreenWakeLock';
import { useTaskStore } from '../../stores/task-store';
import { useFocusStore, type FocusTimer } from '../../stores/focus-store';
import { focusTimeUpAt, isFocusRunning, type FocusLength } from '../../../shared/utils/focus';
import type { FocusOutcome, Task } from '../../../shared/types';

/** How long "Session logged" stays on the picker */
const LOGGED_MS = 4000;
/** The most a time-up check waits, so a computer waking from sleep catches up within a minute */
const MAX_CHECK_MS = 60_000;

/** Height of the header row under the window's title bar strip */
const HEADER_HEIGHT = 56;

/** Ends the timer when its time runs out (and chimes), also while the overlay is hidden */
function useFocusTimeUp(timer: FocusTimer | null): void {
  useEffect(() => {
    if (!isFocusRunning(timer)) return;
    let handle: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (handle !== undefined) clearTimeout(handle);
      const end = focusTimeUpAt(timer);
      if (end === null) return;
      const wait = end - Date.now();
      if (wait > 0) {
        handle = setTimeout(check, Math.min(wait, MAX_CHECK_MS));
        return;
      }
      if (useFocusStore.getState().timer !== timer) return;
      useFocusStore.getState().timeUp();
      playFocusChime();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (handle !== undefined) clearTimeout(handle);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [timer]);
}

/** Fields, where Esc leaves the field before it hides the overlay */
function isFieldTarget(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

interface FocusModeProps {
  /** Opens a task's details (after Got stuck) */
  onOpenTask: (task: Task) => void;
}

export function FocusMode({ onOpenTask }: FocusModeProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const timer = useFocusStore((state) => state.timer);
  const open = useFocusStore((state) => state.open);
  const preselectedTaskId = useFocusStore((state) => state.preselectedTaskId);
  const contentRef = useRef<HTMLDivElement>(null);
  // Counts sessions logged, so each one shows "Session logged" for the full time; 0 hides it
  const [logged, setLogged] = useState(0);

  useFocusTimeUp(timer);
  useScreenWakeLock(isFocusRunning(timer));

  useEffect(() => {
    if (logged === 0) return;
    const handle = setTimeout(() => setLogged(0), LOGGED_MS);
    return () => clearTimeout(handle);
  }, [logged]);

  const view = !timer ? 'picker' : timer.endedAt === null ? 'running' : 'ended';

  // Each screen's first control takes the focus: on open, and when the screen changes
  const focusInitial = (): boolean => {
    const target = contentRef.current?.querySelector<HTMLElement>('[data-focus-initial]');
    target?.focus();
    return !!target;
  };
  useEffect(() => {
    if (open) focusInitial();
  }, [view, open]);

  const hide = () => useFocusStore.getState().hide();

  const handleStart = (task: Task, length: FocusLength) => {
    setLogged(0);
    useFocusStore.getState().start({ projectId: task.projectId, taskId: task.id, taskTitle: task.title }, length);
  };

  const handleLogged = (outcome: FocusOutcome) => {
    if (!timer) return;
    const store = useFocusStore.getState();
    if (outcome === 'stuck') {
      // See what's in the way: the task's details instead of focus mode
      const task = useTaskStore
        .getState()
        .tasks.find((candidate) => candidate.id === timer.taskId && candidate.projectId === timer.projectId);
      store.clear();
      store.hide();
      if (task) onOpenTask(task);
      return;
    }
    // Back to the picker for the next one; after progress, on the same task
    store.clear(outcome === 'progress' ? timer.taskId : null);
    setLogged((count) => count + 1);
  };

  const handleDiscard = () => {
    if (!timer) return;
    useFocusStore.getState().clear(timer.taskId);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && hide()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            if (focusInitial()) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            // The first Esc leaves a field (a half-typed thought or note stays)
            if (isFieldTarget(event.target)) {
              event.preventDefault();
              event.target.blur();
            }
          }}
          className={cn(
            'claude-dialog fixed inset-0 z-50 flex flex-col bg-background text-foreground focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200'
          )}
        >
          {/* Window drag area; on Windows/Linux the top strip sits under the window controls */}
          <header
            className="electron-drag grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4"
            style={{ paddingTop: TITLE_BAR_STRIP_HEIGHT, height: TITLE_BAR_STRIP_HEIGHT + HEADER_HEIGHT }}
          >
            <span />
            <DialogPrimitive.Title className="text-sm font-medium text-(--nav-label-color)">
              {t('focus.title')}
            </DialogPrimitive.Title>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={hide}
                title={timer && view === 'running' ? t('focus.hideHint') : undefined}
                className="electron-no-drag gap-1.5 text-muted-foreground hover:bg-nav-hover hover:text-foreground"
              >
                <Minimize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {t('focus.hide')}
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex min-h-full flex-col justify-center">
              {view === 'picker' && (
                <FocusPicker preselectedTaskId={preselectedTaskId} logged={logged > 0} onStart={handleStart} />
              )}
              {view === 'running' && timer && <FocusRunning timer={timer} />}
              {view === 'ended' && timer && (
                <FocusEnded timer={timer} onLogged={handleLogged} onDiscard={handleDiscard} />
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
