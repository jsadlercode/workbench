/**
 * Focus mode's first screen: the length, the task to focus on, and Start. The tasks come in two
 * groups (src/shared/utils/focus.ts): Needs you (open "your steps", then Human Review) and Up next.
 * A task picked from its details that is in neither group is listed above them.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Button } from '../ui/button';
import { SegmentedControl } from '../settings/SettingsRow';
import { cn } from '../../lib/utils';
import { useToday } from '../../hooks/useToday';
import { useTaskStore } from '../../stores/task-store';
import { useFocusLengthStore } from '../../stores/focus-store';
import { FOCUS_LENGTHS, focusCandidates, type FocusLength } from '../../../shared/utils/focus';
import { getYourSteps } from '../../../shared/utils/your-steps';
import { suggestUpNext, type UpNextReason } from '../../../shared/utils/up-next';
import type { Task } from '../../../shared/types';

interface PickerGroup {
  id: 'selected' | 'needsYou' | 'upNext';
  tasks: Task[];
}

interface FocusPickerProps {
  /** The task to select first (from its details), when it is in the list */
  preselectedTaskId: string | null;
  /** A session was just logged: says so above the list */
  logged: boolean;
  onStart: (task: Task, length: FocusLength) => void;
}

export function FocusPicker({ preselectedTaskId, logged, onStart }: FocusPickerProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const tasks = useTaskStore((state) => state.tasks);
  const today = useToday();
  const length = useFocusLengthStore((state) => state.length);
  const setLength = useFocusLengthStore((state) => state.setLength);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const { groups, reasons } = useMemo(() => {
    const { needsYou, upNext } = focusCandidates(tasks, today);
    const listed = new Set([...needsYou, ...upNext].map((task) => task.id));
    const preselected = preselectedTaskId
      ? tasks.find((task) => task.id === preselectedTaskId && !task.metadata?.archivedAt)
      : undefined;
    const all: PickerGroup[] = [
      { id: 'selected', tasks: preselected && !listed.has(preselected.id) ? [preselected] : [] },
      { id: 'needsYou', tasks: needsYou },
      { id: 'upNext', tasks: upNext }
    ];
    // Why each Up next task is suggested, for its second line
    const upNextReasons = new Map(suggestUpNext(tasks, today).map((suggestion) => [suggestion.task.id, suggestion.reasons]));
    return { groups: all.filter((group) => group.tasks.length > 0), reasons: upNextReasons };
  }, [tasks, today, preselectedTaskId]);

  const ordered = useMemo(() => groups.flatMap((group) => group.tasks), [groups]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  // The task picked here, else the preselected one, else the first
  const selected =
    ordered.find((task) => task.id === pickedId) ??
    ordered.find((task) => task.id === preselectedTaskId) ??
    ordered[0];

  const lengthOptions = useMemo(
    () => FOCUS_LENGTHS.map((minutes) => ({ value: String(minutes), label: t('focus.minutes', { count: minutes }) })),
    [t]
  );

  const reasonText = (reason: UpNextReason): string =>
    reason.key === 'due_in_days'
      ? t('upNext.reasons.due_in_days', { count: reason.days })
      : t(`upNext.reasons.${reason.key}`);

  const detail = (group: PickerGroup['id'], task: Task): string | null => {
    const open = getYourSteps(task).open;
    if (open > 0) return t('focus.picker.stepsLeft', { count: open });
    if (group === 'needsYou') return t('focus.picker.inReview');
    const first = reasons.get(task.id)?.[0];
    return first ? reasonText(first) : null;
  };

  // Up and down arrows move the selection through all groups, like one radio group
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step || !selected) return;
    e.preventDefault();
    const index = ordered.indexOf(selected);
    const next = ordered[(index + step + ordered.length) % ordered.length];
    setPickedId(next.id);
    rowRefs.current.get(next.id)?.focus();
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 pb-12 pt-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-foreground">{t('focus.picker.title')}</h2>
        <p className="mt-2 text-sm text-(--nav-label-color)">{t('focus.picker.description')}</p>
        {/* Always rendered so screen readers announce it */}
        <p role="status" className={cn('mt-3 text-sm text-primary', !logged && 'sr-only')}>
          {logged ? t('focus.picker.logged') : ''}
        </p>
      </div>

      <div className="flex justify-center">
        <SegmentedControl<string>
          value={String(length)}
          options={lengthOptions}
          onValueChange={(value) => setLength(Number(value) as FocusLength)}
          ariaLabel={t('focus.length')}
        />
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-xl bg-segment-track px-6 py-10 text-center">
          <p className="text-sm text-foreground">{t('focus.picker.empty')}</p>
          <p className="mt-1 text-sm text-(--nav-label-color)">{t('focus.picker.emptyHint')}</p>
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label={t('focus.picker.tasks')}
          onKeyDown={handleKeyDown}
          className="flex flex-col gap-5"
        >
          {groups.map((group) => (
            <div key={group.id} role="group" aria-labelledby={`focus-group-${group.id}`}>
              <h3 id={`focus-group-${group.id}`} className="nav-section-label mb-1.5 px-1 text-[0.8125rem]">
                {t(`focus.picker.${group.id}`)}
              </h3>
              <div className="space-y-0.5 rounded-xl bg-segment-track p-1.5">
                {group.tasks.map((task) => {
                  const isSelected = task.id === selected?.id;
                  const line = detail(group.id, task);
                  return (
                    <button
                      key={task.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(task.id, el);
                        else rowRefs.current.delete(task.id);
                      }}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => setPickedId(task.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                        'focus-visible:outline-none focus-visible:shadow-(--shadow-focus)',
                        isSelected
                          ? 'bg-segment-thumb shadow-[inset_0_0_0_1px_var(--segment-thumb-ring),0_1px_2px_0_rgb(0_0_0/0.05)]'
                          : 'hover:bg-nav-hover'
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                          isSelected ? 'border-primary' : 'border-border'
                        )}
                      >
                        {isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-foreground" title={task.title}>
                          {task.title}
                        </span>
                        {line && <span className="block truncate text-xs text-(--nav-label-color)">{line}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {ordered.length > 0 && (
        <div className="flex justify-center">
          <Button
            data-focus-initial
            onClick={() => selected && onStart(selected, length)}
            disabled={!selected}
            className="gap-2 px-5"
          >
            <Play className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {t('focus.picker.start')}
          </Button>
        </div>
      )}
    </div>
  );
}
