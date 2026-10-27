/**
 * The weekly review's four tiles: Finished, Planned work done (with a meter), Focus time, and
 * Still open (this week) or Carried over (a past week). A past week with a saved review shows the
 * figures saved with it; the page says so under the tiles.
 */
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/card';
import { useFocusDuration } from '../focus/useFocusDuration';
import { plannedDonePercent, type FocusWeek } from '../../../shared/utils/weekly-review';
import type { WeeklyReviewStats } from '../../../shared/types';

interface ReviewTilesProps {
  stats: WeeklyReviewStats;
  /** Focus sessions by outcome; left out for saved figures, which don't keep them */
  focus: Pick<FocusWeek, 'finished' | 'stuck'> | null;
  isCurrent: boolean;
}

function Tile({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <li className="min-w-0">
      <Card className="flex h-full flex-col gap-1 px-4 py-3">
        <span className="text-[0.8125rem] text-(--nav-label-color)">{label}</span>
        <span className="text-[1.75rem] font-semibold leading-tight text-foreground">{value}</span>
        {children}
      </Card>
    </li>
  );
}

const Sub = ({ children }: { children: React.ReactNode }) => (
  <span className="text-xs text-muted-foreground wrap-anywhere">{children}</span>
);

export function ReviewTiles({ stats, focus, isCurrent }: ReviewTilesProps) {
  const { t } = useTranslation('tasks');
  const duration = useFocusDuration();
  const percent = plannedDonePercent(stats);

  const finishedSub =
    stats.done === 0
      ? t(isCurrent ? 'weeklyReview.tiles.nothingFinishedYet' : 'weeklyReview.tiles.nothingFinished')
      : stats.unplanned === 0
        ? t('weeklyReview.tiles.noneUnplanned')
        : t('weeklyReview.tiles.unplanned', { count: stats.unplanned });

  const sessions = t('weeklyReview.tiles.sessions', { count: stats.sessions });
  const focusSub =
    focus && stats.sessions > 0
      ? t('weeklyReview.tiles.sessionsOutcomes', { sessions, finished: focus.finished, stuck: focus.stuck })
      : sessions;

  return (
    <ul aria-label={t('weeklyReview.tiles.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label={t('weeklyReview.tiles.finished')} value={String(stats.done)}>
        <Sub>{finishedSub}</Sub>
      </Tile>

      {/* Nothing planned isn't 0% done: it says so instead of showing a failing figure */}
      <Tile label={t('weeklyReview.tiles.plannedDone')} value={percent === null ? t('weeklyReview.tiles.noPlan') : `${percent}%`}>
        <div
          role="meter"
          aria-label={t('weeklyReview.tiles.plannedDone')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? 0}
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-primary/15"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent ?? 0}%` }} />
        </div>
        <Sub>
          {stats.planned === 0
            ? t('weeklyReview.tiles.nothingPlanned')
            : t('weeklyReview.tiles.plannedOf', { done: stats.plannedDone, total: stats.planned })}
        </Sub>
      </Tile>

      <Tile label={t('weeklyReview.tiles.focus')} value={duration(stats.focusSeconds)}>
        <Sub>{focusSub}</Sub>
      </Tile>

      <Tile label={t(isCurrent ? 'weeklyReview.tiles.stillOpen' : 'weeklyReview.tiles.carriedOver')} value={String(stats.carried)}>
        <Sub>
          {stats.hardMissed === 0
            ? t('weeklyReview.tiles.noHardMissed')
            : t('weeklyReview.tiles.hardMissed', { count: stats.hardMissed })}
        </Sub>
      </Tile>
    </ul>
  );
}
