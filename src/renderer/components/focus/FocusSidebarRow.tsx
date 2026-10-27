/**
 * The sidebar's Focus row, under New task. Opens focus mode; while a timer exists it shows the
 * time left, "Paused", or "Time's up" until the session is logged. A component of its own, so
 * only this row re-renders each second while the timer runs.
 */
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { useFocusClock } from '../../hooks/useFocusClock';
import { useFocusStore } from '../../stores/focus-store';
import { focusClock, formatFocusClock } from '../../../shared/utils/focus';

interface FocusSidebarRowProps {
  /** The sidebar's row look */
  className: string;
  collapsed: boolean;
  /** No project to focus in (a timer that exists can still be opened) */
  disabled: boolean;
}

export function FocusSidebarRow({ className, collapsed, disabled }: FocusSidebarRowProps) {
  const { t } = useTranslation('navigation');
  const timer = useFocusStore((state) => state.timer);
  const openFocus = useFocusStore((state) => state.openFocus);
  const now = useFocusClock(timer);

  const label = t('actions.focus');
  const ended = timer?.endedAt != null;
  const status = !timer
    ? null
    : ended
      ? t('focus.timeUp')
      : timer.pausedAt !== null
        ? t('focus.paused')
        : formatFocusClock(focusClock(timer, now).remainingMs);
  const statusLabel = status && !ended && timer?.pausedAt === null ? t('focus.timeLeft', { time: status }) : status;

  const button = (
    <button
      type="button"
      onClick={() => openFocus()}
      disabled={disabled && !timer}
      aria-label={statusLabel ? t('focus.rowLabel', { status: statusLabel }) : undefined}
      className={cn(className, 'text-foreground')}
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
        <Timer className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.75} />
        {/* Collapsed, a dot says a timer exists */}
        {collapsed && timer && (
          <span aria-hidden="true" className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
      {!collapsed && status && (
        <span
          aria-hidden="true"
          className={cn('shrink-0 pr-2 text-xs tabular-nums', ended ? 'text-primary' : 'text-(--nav-label-color)')}
        >
          {status}
        </span>
      )}
    </button>
  );

  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{status ? t('focus.rowTooltip', { status }) : label}</TooltipContent>
    </Tooltip>
  );
}
