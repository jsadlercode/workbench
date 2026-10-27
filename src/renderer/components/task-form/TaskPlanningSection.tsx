/**
 * TaskPlanningSection - the Planning section of the task create and edit dialogs
 *
 * The week the user plans to work on the task, its deadline (a hard one or a target date) and its
 * flag, kept in the task's metadata (src/shared/utils/task-planning.ts). A task planned for a past
 * week, or a week after next week, selects no week and says which week it has. Below them, who or
 * what the task is waiting on (src/shared/utils/waiting.ts), when a change handler is given.
 */
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { SettingsRow, SettingsRows, SegmentedControl } from '../settings/SettingsRow';
import { SettingsSection } from '../settings/SettingsSection';
import { PLAN_CHOICES, type PlanChoice, type PlanningFormValue } from '../../../shared/utils/task-planning';
import { useToday } from '../../hooks/useToday';
import { usePlanningLabels } from '../../hooks/usePlanningLabels';

interface TaskPlanningSectionProps {
  value: PlanningFormValue;
  onChange: (value: PlanningFormValue) => void;
  disabled?: boolean;
  /** Keeps the field ids apart when both dialogs are mounted */
  idPrefix?: string;
  /** Who or what the task is waiting on; empty when it isn't waiting */
  waitingOn?: string;
  onWaitingOnChange?: (value: string) => void;
}

export function TaskPlanningSection({
  value,
  onChange,
  disabled = false,
  idPrefix = '',
  waitingOn = '',
  onWaitingOnChange
}: TaskPlanningSectionProps) {
  const { t } = useTranslation('tasks');
  const today = useToday();
  const planningLabels = usePlanningLabels();
  const prefix = idPrefix ? `${idPrefix}-` : '';

  // A week no choice gives: "Carried over from the week of 20 Oct", "Week of 17 Nov"
  const otherWeek = value.when === null ? planningLabels.otherWeek(value.plannedFor, today) : null;
  const hasDeadline = value.deadline !== '';

  const options = PLAN_CHOICES.map((choice) => ({
    value: choice,
    label: choice === 'unplanned' ? t('planning.form.notSet') : t(`planning.choices.${choice}`),
    disabled
  }));

  return (
    <SettingsSection title={t('planning.form.title')}>
      <SettingsRows>
        <SettingsRow label={t('planning.form.when')} description={otherWeek ?? t('planning.form.whenDescription')}>
          <SegmentedControl<PlanChoice | ''>
            value={value.when ?? ''}
            options={options}
            onValueChange={(when) => {
              if (when) onChange({ ...value, when, plannedFor: undefined });
            }}
            ariaLabel={t('planning.form.when')}
          />
        </SettingsRow>
        <SettingsRow
          label={t('planning.form.deadline')}
          description={t('planning.form.deadlineDescription')}
          htmlFor={`${prefix}deadline`}
        >
          {hasDeadline && (
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-nav-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              onClick={() => onChange({ ...value, deadline: '', hardDeadline: false })}
              disabled={disabled}
              title={t('planning.form.clearDeadline')}
              aria-label={t('planning.form.clearDeadline')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <Input
            id={`${prefix}deadline`}
            type="date"
            value={value.deadline}
            onChange={(e) => {
              const deadline = e.target.value;
              onChange({ ...value, deadline, hardDeadline: deadline ? value.hardDeadline : false });
            }}
            disabled={disabled}
            spellCheck={false}
            className="h-8 w-auto"
          />
        </SettingsRow>
        <SettingsRow
          label={t('planning.form.hardDeadline')}
          description={t('planning.form.hardDeadlineDescription')}
          htmlFor={`${prefix}hard-deadline`}
        >
          <Switch
            id={`${prefix}hard-deadline`}
            checked={hasDeadline && value.hardDeadline}
            onCheckedChange={(hardDeadline) => onChange({ ...value, hardDeadline })}
            disabled={disabled || !hasDeadline}
          />
        </SettingsRow>
        <SettingsRow
          label={t('planning.form.flag')}
          description={t('planning.form.flagDescription')}
          htmlFor={`${prefix}flagged`}
        >
          <Switch
            id={`${prefix}flagged`}
            checked={value.flagged}
            onCheckedChange={(flagged) => onChange({ ...value, flagged })}
            disabled={disabled}
          />
        </SettingsRow>
        {onWaitingOnChange && (
          <SettingsRow
            label={t('waiting.form.label')}
            description={t('waiting.form.description')}
            htmlFor={`${prefix}waiting-on`}
          >
            <Input
              id={`${prefix}waiting-on`}
              value={waitingOn}
              onChange={(e) => onWaitingOnChange(e.target.value)}
              placeholder={t('waiting.form.placeholder')}
              disabled={disabled}
              className="h-8 w-64"
            />
          </SettingsRow>
        )}
      </SettingsRows>
    </SettingsSection>
  );
}
