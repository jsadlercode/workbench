/**
 * Quick capture: one line at the top of the board that drops a task into the Backlog without the
 * task dialog. The typed text is the description (and the title when it's short, see
 * captureTitle) and the When choice its planned week; base branch and connectors get the defaults
 * the dialog gives when its fields are left as they are (useQuickCapture), and triage picks model
 * and effort when the task runs.
 *
 * Enter adds the task and keeps the focus in the field for the next one; Esc leaves the field.
 * N focuses it from anywhere on the board, except while typing in a field or with a dialog open.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { SegmentedControl } from './settings/SettingsRow';
import { cn } from '../lib/utils';
import { useQuickCapture } from '../hooks/useQuickCapture';
import { CAPTURE_CHOICES, useQuickCaptureStore, type CaptureWhen } from '../stores/quick-capture-store';
import { plannedForChoice } from '../../shared/utils/task-planning';

/** The key that focuses the field from the board */
export const QUICK_CAPTURE_SHORTCUT = 'n';

/** How long "Added to Backlog" stays */
const CONFIRMATION_MS = 2500;

const INPUT_ID = 'quick-capture-input';
const ERROR_ID = 'quick-capture-error';

// Where a typed N belongs to the focused element: fields, editable text, and open menus or lists
const TYPING_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="menu"], [role="listbox"]';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (target instanceof HTMLElement && target.isContentEditable) || target.closest(TYPING_SELECTOR) !== null;
}

/** Whether a dialog (task details, the task dialog, settings, a confirmation) is open */
function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

interface QuickCaptureBarProps {
  projectId: string;
  className?: string;
}

export function QuickCaptureBar({ projectId, className }: QuickCaptureBarProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const capture = useQuickCapture(projectId);
  const when = useQuickCaptureStore((state) => state.when);
  const setWhen = useQuickCaptureStore((state) => state.setWhen);

  const inputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  // Counts tasks added, so each add shows the confirmation for the full time; 0 hides it
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (added === 0) return;
    const timer = setTimeout(() => setAdded(0), CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [added]);

  // N focuses the field from anywhere on the board
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // (Chrome's autofill sends keydown events without a key)
      if (typeof e.key !== 'string' || e.key.toLowerCase() !== QUICK_CAPTURE_SHORTCUT) return;
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target) || isDialogOpen()) return;
      const input = inputRef.current;
      if (!input) return;
      // Keep the N out of the field
      e.preventDefault();
      input.focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const options = useMemo(
    () => CAPTURE_CHOICES.map((choice) => ({ value: choice, label: t(`tasks:planning.choices.${choice}`) })),
    [t]
  );

  const description = text.trim();

  /** Back to the field for the next task, unless the user has moved on to something else */
  const refocus = () => {
    const input = inputRef.current;
    const active = document.activeElement;
    if (input && (!active || active === document.body || active === input || active === addButtonRef.current)) {
      input.focus();
    }
  };

  const handleAdd = async () => {
    if (!description || isCreating) return;
    setIsCreating(true);
    setError(null);
    setAdded(0);
    const failure = await capture(description, plannedForChoice(when, new Date()));
    if (failure) {
      setError(failure);
    } else {
      setText('');
      setAdded((count) => count + 1);
    }
    setIsCreating(false);
    refocus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <section aria-label={t('tasks:capture.title')} className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 basis-64" title={t('tasks:capture.shortcutHint')}>
          <Input
            ref={inputRef}
            id={INPUT_ID}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            // Read-only (not disabled) while adding, so the field keeps the focus
            readOnly={isCreating}
            placeholder={t('tasks:capture.placeholder')}
            aria-label={t('tasks:capture.placeholder')}
            aria-keyshortcuts={QUICK_CAPTURE_SHORTCUT.toUpperCase()}
            aria-busy={isCreating}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ERROR_ID : undefined}
            autoComplete="off"
            className="h-8 py-1 pr-9"
          />
          {/* The shortcut, while the field is empty and not focused */}
          {!focused && !text && (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 font-sans text-[0.6875rem] leading-4 text-(--nav-label-color)"
            >
              {QUICK_CAPTURE_SHORTCUT.toUpperCase()}
            </kbd>
          )}
        </div>
        <SegmentedControl<CaptureWhen>
          value={when}
          options={options}
          onValueChange={setWhen}
          ariaLabel={t('tasks:planning.form.when')}
        />
        <Button
          ref={addButtonRef}
          size="sm"
          onClick={() => void handleAdd()}
          disabled={!description || isCreating}
          className="h-8 shrink-0 gap-1.5 px-3"
        >
          {isCreating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t('common:buttons.add')}
        </Button>
        {/* Always rendered so screen readers announce it; out of the layout while empty */}
        <p role="status" className={cn('text-xs text-(--nav-label-color)', added === 0 && 'sr-only')}>
          {added > 0 ? t('tasks:capture.added') : ''}
        </p>
      </div>
      {error && (
        <p id={ERROR_ID} role="alert" className="mt-1 text-xs text-destructive wrap-anywhere">
          {t('tasks:capture.failed', { error })}
        </p>
      )}
    </section>
  );
}
