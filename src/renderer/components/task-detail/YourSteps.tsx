import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { setYourStepDone } from '../../stores/task-store';
import { getYourSteps } from '../../../shared/utils/your-steps';
import type { Task } from '../../../shared/types';

interface YourStepsProps {
  task: Task;
}

/**
 * The steps the task's run left for the user (send a drafted email, add a secret, test on a
 * device), as a checklist. Ticking a step saves it with the task. Nothing is shown when the run
 * left no steps.
 */
export function YourSteps({ task }: YourStepsProps) {
  const { t } = useTranslation('tasks');
  const [saveFailed, setSaveFailed] = useState(false);
  const { steps, open, total } = getYourSteps(task);
  if (total === 0) return null;

  const toggle = async (text: string, done: boolean) => {
    setSaveFailed(false);
    const saved = await setYourStepDone(task.id, text, done);
    if (!saved) setSaveFailed(true);
  };

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h3 className="text-sm text-foreground">{t('yourSteps.title')}</h3>
        <span className="shrink-0 text-xs tabular-nums text-(--nav-label-color)">
          {t('yourSteps.progress', { done: total - open, total })}
        </span>
      </div>
      <p className="mb-3 text-sm text-(--nav-label-color)">{t('yourSteps.description')}</p>

      <ul className="space-y-0.5 rounded-xl bg-segment-track p-1.5">
        {steps.map((step) => (
          <li key={step.text}>
            <button
              type="button"
              role="checkbox"
              aria-checked={step.done}
              onClick={() => void toggle(step.text, !step.done)}
              className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-nav-hover"
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[0.25rem] border transition-colors',
                  step.done ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                )}
              >
                {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span
                className={cn(
                  'min-w-0 wrap-anywhere',
                  step.done ? 'text-(--nav-label-color) line-through' : 'text-foreground'
                )}
              >
                {step.text}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {saveFailed && <p role="alert" className="mt-2 px-1 text-xs text-destructive">{t('yourSteps.saveFailed')}</p>}
    </div>
  );
}
