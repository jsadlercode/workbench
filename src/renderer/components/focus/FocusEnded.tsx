/**
 * Focus mode once the timer ended (time ran out, or Stop and log): "How did that go?" with an
 * optional note. Each outcome logs the session on the task; Don't log drops it. When logging
 * fails, the screen stays as it is and says so.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, LifeBuoy, PartyPopper, TrendingUp, type LucideIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useFocusDuration } from './useFocusDuration';
import { logFocusSession, useTaskStore } from '../../stores/task-store';
import { useFocusStore, type FocusTimer } from '../../stores/focus-store';
import { focusClock, toFocusSession } from '../../../shared/utils/focus';
import type { FocusOutcome } from '../../../shared/types';

const OUTCOMES: { outcome: FocusOutcome; icon: LucideIcon }[] = [
  { outcome: 'finished', icon: PartyPopper },
  { outcome: 'progress', icon: TrendingUp },
  { outcome: 'stuck', icon: LifeBuoy }
];

const NOTE_ID = 'focus-note';

interface FocusEndedProps {
  timer: FocusTimer;
  /** The session was logged with this outcome */
  onLogged: (outcome: FocusOutcome) => void;
  /** Don't log */
  onDiscard: () => void;
}

export function FocusEnded({ timer, onLogged, onDiscard }: FocusEndedProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const duration = useFocusDuration();
  const note = useFocusStore((state) => state.note);
  const setNote = useFocusStore((state) => state.setNote);
  const title = useTaskStore(
    (state) =>
      state.tasks.find((task) => task.id === timer.taskId && task.projectId === timer.projectId)?.title ?? timer.taskTitle
  );
  const [saving, setSaving] = useState<FocusOutcome | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const focusedSeconds = Math.round(focusClock(timer, timer.endedAt ?? Date.now()).focusedMs / 1000);

  const handleOutcome = async (outcome: FocusOutcome) => {
    if (saving) return;
    setSaving(outcome);
    setSaveFailed(false);
    const saved = await logFocusSession(timer.taskId, timer.projectId, toFocusSession(timer, outcome, note));
    setSaving(null);
    if (saved) onLogged(outcome);
    else setSaveFailed(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 pb-12 pt-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">{t('focus.ended.title')}</h2>
        <p className="mt-2 text-sm text-(--nav-label-color) wrap-anywhere">
          {t('focus.ended.focused', { duration: duration(focusedSeconds), title })}
        </p>
      </div>

      <div>
        <label htmlFor={NOTE_ID} className="sr-only">
          {t('focus.ended.note')}
        </label>
        <textarea
          id={NOTE_ID}
          data-focus-initial
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('focus.ended.notePlaceholder')}
          rows={3}
          spellCheck
          disabled={saving !== null}
          className={cn(
            'field-border block w-full resize-none rounded-lg border px-3 py-2 text-sm leading-relaxed text-foreground',
            'placeholder:text-(--field-placeholder) focus-visible:outline-none disabled:opacity-60'
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {OUTCOMES.map(({ outcome, icon: Icon }) => (
          <Button
            key={outcome}
            variant="outline"
            onClick={() => void handleOutcome(outcome)}
            disabled={saving !== null}
            title={outcome === 'stuck' ? t('focus.ended.stuckHint') : undefined}
            className="h-auto flex-col gap-2 py-4"
          >
            {saving === outcome ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            )}
            {t(`focus.ended.${outcome}`)}
          </Button>
        ))}
      </div>

      {saveFailed && (
        <p role="alert" className="text-center text-sm text-destructive">
          {t('focus.ended.saveFailed')}
        </p>
      )}

      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          disabled={saving !== null}
          className="text-(--nav-label-color) hover:text-foreground"
        >
          {t('focus.ended.dontLog')}
        </Button>
      </div>
    </div>
  );
}
