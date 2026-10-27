/**
 * WaitingChip - "Waiting · House Labs reply" on a task waiting on someone or something
 * (src/shared/utils/waiting.ts), on the task card and in the task's details. Amber like the other
 * "needs a look" labels, truncated, with the full text in its tooltip.
 */
import { useTranslation } from 'react-i18next';
import { Hourglass } from 'lucide-react';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { isWaiting } from '../../shared/utils/waiting';
import type { Task } from '../../shared/types';

interface WaitingChipProps {
  task: Pick<Task, 'metadata'>;
  /** The muted label color instead of amber (a done task) */
  muted?: boolean;
  className?: string;
}

export function WaitingChip({ task, muted = false, className }: WaitingChipProps) {
  const { t } = useTranslation('tasks');
  if (!isWaiting(task)) return null;
  const waitingOn = task.metadata?.waitingOn?.trim() ?? '';

  return (
    <Badge
      variant="outline"
      title={t('waiting.chipTitle', { waitingOn })}
      className={cn(
        'max-w-full gap-1.5 text-xs',
        muted ? 'border-border text-(--nav-label-color)' : 'border-current bg-warning/10 text-warning',
        className
      )}
    >
      <Hourglass className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span className="min-w-0 truncate">{t('waiting.chip', { waitingOn })}</span>
    </Badge>
  );
}
