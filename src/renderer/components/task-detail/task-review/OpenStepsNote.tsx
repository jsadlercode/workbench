import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import { getYourSteps } from '../../../../shared/utils/your-steps';
import type { Task } from '../../../../shared/types';

interface OpenStepsNoteProps {
  task: Task;
  /** What merging does to the task and its steps, worded for the dialog */
  hint: string;
  className?: string;
}

/**
 * The steps the task's run left for the user that aren't ticked yet, shown before a merge with
 * what merging does to the task. Only informs: the merge isn't blocked. Nothing is shown when
 * no step is open.
 */
export function OpenStepsNote({ task, hint, className }: OpenStepsNoteProps) {
  const { t } = useTranslation('taskReview');
  const openSteps = getYourSteps(task).steps.filter((step) => !step.done);
  if (openSteps.length === 0) return null;

  return (
    <div className={cn('rounded-xl bg-segment-track px-4 py-3 text-sm', className)}>
      <p className="text-foreground">{t('openSteps.title', { count: openSteps.length })}</p>
      <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-(--nav-label-color)">
        {openSteps.map((step) => (
          <li key={step.text} className="wrap-anywhere">{step.text}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-(--nav-label-color)">{hint}</p>
    </div>
  );
}
