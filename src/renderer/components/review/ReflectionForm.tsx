/**
 * "How did the week go?": Overall and Energy on five-step scales, and three short notes. The
 * fields start from the week's saved review; changes are kept as the week's draft (in the review
 * store) until saved, so paging to another week and back keeps them.
 */
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { SegmentedControl } from '../settings/SettingsRow';
import { cn } from '../../lib/utils';
import { formatDateTime } from '../../../shared/utils/format-date-time';
import type { WeeklyReview, WeeklyReviewRating } from '../../../shared/types';
import { EMPTY_REVIEW_DRAFT, type WeeklyReviewDraft } from '../../stores/weekly-review-store';

const RATINGS: readonly WeeklyReviewRating[] = [1, 2, 3, 4, 5];

type TextField = 'wentWell' | 'gotInTheWay' | 'tryNext';
const TEXT_FIELDS: readonly TextField[] = ['wentWell', 'gotInTheWay', 'tryNext'];

/** The form's fields for a saved review */
function draftOf(review: WeeklyReview | undefined): WeeklyReviewDraft {
  if (!review) return EMPTY_REVIEW_DRAFT;
  return {
    overall: review.overall,
    energy: review.energy,
    wentWell: review.wentWell,
    gotInTheWay: review.gotInTheWay,
    tryNext: review.tryNext
  };
}

function sameDraft(a: WeeklyReviewDraft, b: WeeklyReviewDraft): boolean {
  return (
    a.overall === b.overall &&
    a.energy === b.energy &&
    TEXT_FIELDS.every((field) => a[field] === b[field])
  );
}

interface ReflectionFormProps {
  saved: WeeklyReview | undefined;
  draft: WeeklyReviewDraft | undefined;
  onDraftChange: (draft: WeeklyReviewDraft) => void;
  /** Save the form's fields; resolves to whether they were saved */
  onSave: (draft: WeeklyReviewDraft) => Promise<boolean>;
}

export function ReflectionForm({ saved, draft, onDraftChange, onSave }: ReflectionFormProps) {
  const { t } = useTranslation('tasks');
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const value = draft ?? draftOf(saved);
  const dirty = !!draft && !sameDraft(draft, draftOf(saved));

  const change = (patch: Partial<WeeklyReviewDraft>) => {
    setSaveFailed(false);
    onDraftChange({ ...value, ...patch });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveFailed(false);
    const ok = await onSave(value).catch(() => false);
    setSaving(false);
    if (!ok) setSaveFailed(true);
  };

  const scale = (field: 'overall' | 'energy') => {
    const labelId = `${id}-${field}`;
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span id={labelId} className="text-sm text-foreground">
          {t(`weeklyReview.reflection.${field}`)}
        </span>
        <SegmentedControl
          // Nothing picked yet: no option is selected
          value={value[field] ? String(value[field]) : ''}
          options={RATINGS.map((rating) => ({
            value: String(rating),
            label: t(`weeklyReview.reflection.${field}Scale.${rating}`),
            disabled: saving
          }))}
          onValueChange={(next) => change({ [field]: Number(next) as WeeklyReviewRating })}
          ariaLabel={t(`weeklyReview.reflection.${field}`)}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {scale('overall')}
      {scale('energy')}

      {TEXT_FIELDS.map((field) => (
        <div key={field} className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-${field}`} className="text-sm text-foreground">
            {t(`weeklyReview.reflection.${field}`)}
          </label>
          <textarea
            id={`${id}-${field}`}
            value={value[field]}
            onChange={(e) => change({ [field]: e.target.value })}
            rows={2}
            spellCheck
            disabled={saving}
            className={cn(
              'field-border block w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground',
              'placeholder:text-(--field-placeholder) focus-visible:outline-none disabled:opacity-60'
            )}
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {saveFailed ? (
          <span role="alert" className="text-xs text-destructive">
            {t('weeklyReview.reflection.saveFailed')}
          </span>
        ) : dirty ? (
          <span className="text-xs text-(--nav-label-color)">{t('weeklyReview.reflection.unsaved')}</span>
        ) : (
          saved && (
            <span className="text-xs text-(--nav-label-color)">
              {t('weeklyReview.reflection.saved', { time: formatDateTime(saved.savedAt) })}
            </span>
          )
        )}
        <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="h-8 gap-1.5 px-3">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t(saved ? 'weeklyReview.reflection.update' : 'weeklyReview.reflection.save')}
        </Button>
      </div>
    </div>
  );
}
