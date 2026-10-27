/**
 * "Park a stray thought": one line under the timer that drops a thought into the Backlog (not
 * planned, so it waits in "Not planned") without leaving focus. Enter parks it and keeps the
 * focus in the field for the next one. The new task's timeline starts with where it came from
 * ("Parked during a focus session on ...").
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useQuickCapture } from '../../hooks/useQuickCapture';
import type { TaskActivity } from '../../../shared/types';

/** How long "Added to Backlog" stays */
const CONFIRMATION_MS = 2500;

const INPUT_ID = 'focus-park-input';
const ERROR_ID = 'focus-park-error';

interface ParkThoughtProps {
  /** The timer's project, where the thought goes */
  projectId: string;
  /** The title of the task being focused on, for the parked task's timeline */
  focusedTaskTitle: string;
}

export function ParkThought({ projectId, focusedTaskTitle }: ParkThoughtProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const capture = useQuickCapture(projectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Counts thoughts parked, so each one shows the confirmation for the full time; 0 hides it
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (added === 0) return;
    const timer = setTimeout(() => setAdded(0), CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [added]);

  const thought = text.trim();

  const handlePark = async () => {
    if (!thought || isAdding) return;
    setIsAdding(true);
    setError(null);
    setAdded(0);
    // Not planned: it waits in the Backlog's "Not planned" group
    const parked: TaskActivity = { at: new Date().toISOString(), kind: 'parked' };
    if (focusedTaskTitle.trim()) parked.value = focusedTaskTitle.trim();
    const failure = await capture(thought, undefined, { activity: [parked] });
    if (failure) {
      setError(failure);
    } else {
      setText('');
      setAdded((count) => count + 1);
    }
    setIsAdding(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.key !== 'Enter') return;
    e.preventDefault();
    void handlePark();
  };

  return (
    <section aria-labelledby={`${INPUT_ID}-label`} className="w-full">
      <label id={`${INPUT_ID}-label`} htmlFor={INPUT_ID} className="mb-1.5 block px-1 text-sm text-foreground">
        {t('focus.park.label')}
      </label>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          id={INPUT_ID}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          // Read-only (not disabled) while adding, so the field keeps the focus
          readOnly={isAdding}
          placeholder={t('focus.park.placeholder')}
          aria-busy={isAdding}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : `${INPUT_ID}-hint`}
          autoComplete="off"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handlePark()}
          disabled={!thought || isAdding}
          className="shrink-0 gap-1.5 px-3"
        >
          {isAdding && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t('focus.park.add')}
        </Button>
      </div>
      <div className="mt-1.5 flex min-h-4 items-center gap-2 px-1 text-xs">
        <span id={`${INPUT_ID}-hint`} className={cn('text-(--nav-label-color)', (added > 0 || error) && 'sr-only')}>
          {t('focus.park.hint')}
        </span>
        {/* Always rendered so screen readers announce it */}
        <span role="status" className={cn('text-primary', added === 0 && 'sr-only')}>
          {added > 0 ? t('focus.park.added') : ''}
        </span>
        {error && (
          <span id={ERROR_ID} role="alert" className="text-destructive wrap-anywhere">
            {t('focus.park.failed', { error })}
          </span>
        )}
      </div>
    </section>
  );
}
