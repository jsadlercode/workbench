/**
 * The last eight weeks, from the saved reviews: a bar per week of the planned work finished, and
 * under it, on its own scale, the Overall rating as dots joined by a line. Two charts on one week
 * axis rather than one chart with two scales, which would invent a link between them. The week
 * the page shows is highlighted. Until two weeks have a review it says how the trend appears.
 */
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { formatDateKey } from '../../../shared/utils/task-planning';
import type { TrendWeek } from '../../../shared/utils/weekly-review';

const BAR_HEIGHT = 96;
const RATING_HEIGHT = 64;
/** Room for the percent above a full bar (px) */
const LABEL_HEIGHT = 18;
/** Keeps the top and bottom dots inside the strip (percent of its height) */
const RATING_PAD = 12;

interface TrendChartProps {
  weeks: TrendWeek[];
  /** The week the page shows */
  viewedWeek: string;
  today: Date;
}

/** Where a 1 to 5 rating sits in the rating strip, from the top (percent) */
function ratingY(rating: number): number {
  return RATING_PAD + ((5 - rating) / 4) * (100 - 2 * RATING_PAD);
}

export function TrendChart({ weeks, viewedWeek, today }: TrendChartProps) {
  const { t } = useTranslation('tasks');
  const reviewed = weeks.filter((week) => week.review).length;
  if (reviewed < 2) {
    return <p className="text-sm text-(--nav-label-color)">{t('weeklyReview.trend.empty')}</p>;
  }

  const count = weeks.length;
  const rated = weeks
    .map((week, index) => ({ index, overall: week.overall }))
    .filter((point): point is { index: number; overall: number } => point.overall !== null);
  const linePoints = rated.map((point) => `${point.index * 100 + 50},${ratingY(point.overall)}`).join(' ');
  const overallLabel = (rating: number | null) =>
    rating === null ? t('weeklyReview.trend.noRating') : t(`weeklyReview.reflection.overallScale.${rating}`);
  const percentLabel = (percent: number | null) => (percent === null ? t('weeklyReview.trend.nothingPlanned') : `${percent}%`);
  const weekSummary = (week: TrendWeek) =>
    week.review
      ? t('weeklyReview.trend.weekSummary', {
          date: formatDateKey(week.week, today),
          planned:
            week.plannedDonePercent === null
              ? t('weeklyReview.trend.nothingPlanned')
              : t('weeklyReview.trend.plannedPercent', { percent: week.plannedDonePercent }),
          overall: overallLabel(week.overall)
        })
      : t('weeklyReview.trend.weekNoReview', { date: formatDateKey(week.week, today) });

  const columnClass = (week: TrendWeek) => cn('min-w-0 flex-1', week.week === viewedWeek && 'bg-segment-track');

  return (
    <figure className="m-0" aria-label={t('weeklyReview.trend.title')}>
      {/* Planned work finished */}
      <figcaption className="mb-1 text-xs text-muted-foreground">{t('weeklyReview.trend.plannedDone')}</figcaption>
      <div className="flex gap-2">
        <div className="relative w-12 shrink-0 text-right text-[0.6875rem] leading-none text-(--nav-label-color) tabular-nums" style={{ height: BAR_HEIGHT + LABEL_HEIGHT }}>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: LABEL_HEIGHT }}>100%</span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: LABEL_HEIGHT + BAR_HEIGHT / 2 }}>50%</span>
        </div>
        <div className="relative flex min-w-0 flex-1 border-b border-border" style={{ height: BAR_HEIGHT + LABEL_HEIGHT }}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-settings-divider" style={{ top: LABEL_HEIGHT }} />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 border-t border-settings-divider"
            style={{ top: LABEL_HEIGHT + BAR_HEIGHT / 2 }}
          />
          {weeks.map((week) => (
            <div
              key={week.week}
              title={weekSummary(week)}
              data-trend-week={week.week}
              className={cn(columnClass(week), 'relative flex flex-col items-center justify-end rounded-t-lg')}
            >
              {week.plannedDonePercent !== null && (
                <>
                  <span aria-hidden="true" className="mb-1 text-[0.6875rem] leading-none text-muted-foreground tabular-nums">
                    {week.plannedDonePercent}%
                  </span>
                  <div
                    aria-hidden="true"
                    className="w-[calc(100%-4px)] max-w-6 rounded-t-[4px] bg-foreground/70"
                    style={{ height: (week.plannedDonePercent / 100) * BAR_HEIGHT, minHeight: week.plannedDonePercent > 0 ? 2 : 0 }}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Overall rating */}
      <p className="mb-1 mt-4 text-xs text-muted-foreground">{t('weeklyReview.reflection.overall')}</p>
      <div className="flex gap-2">
        <div className="relative w-12 shrink-0 text-right text-[0.6875rem] leading-none text-(--nav-label-color)" style={{ height: RATING_HEIGHT }}>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: `${ratingY(5)}%` }}>
            {t('weeklyReview.reflection.overallScale.5')}
          </span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: `${ratingY(1)}%` }}>
            {t('weeklyReview.reflection.overallScale.1')}
          </span>
        </div>
        <div className="relative flex min-w-0 flex-1" style={{ height: RATING_HEIGHT }}>
          {weeks.map((week) => (
            <div key={week.week} className={cn(columnClass(week), 'rounded-b-lg')} />
          ))}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            viewBox={`0 0 ${count * 100} 100`}
            preserveAspectRatio="none"
          >
            {rated.length > 1 && (
              <polyline
                points={linePoints}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {rated.map((point) => (
            <span
              key={weeks[point.index].week}
              title={weekSummary(weeks[point.index])}
              data-trend-rating={point.overall}
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
              style={{ left: `${((point.index + 0.5) / count) * 100}%`, top: `${ratingY(point.overall)}%` }}
            />
          ))}
        </div>
      </div>

      {/* Weeks */}
      <div aria-hidden="true" className="mt-1.5 flex gap-2">
        <div className="w-12 shrink-0" />
        <div className="flex min-w-0 flex-1">
          {weeks.map((week) => (
            <span
              key={week.week}
              className={cn(
                'min-w-0 flex-1 truncate text-center text-[0.6875rem] leading-none',
                week.week === viewedWeek ? 'font-semibold text-foreground' : 'text-(--nav-label-color)'
              )}
            >
              {formatDateKey(week.week, today)}
            </span>
          ))}
        </div>
      </div>

      {/* The same figures as a table, for screen readers */}
      <table className="sr-only">
        <caption>{t('weeklyReview.trend.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('weeklyReview.trend.week')}</th>
            <th scope="col">{t('weeklyReview.trend.plannedDone')}</th>
            <th scope="col">{t('weeklyReview.reflection.overall')}</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.week}>
              <th scope="row">{formatDateKey(week.week, today)}</th>
              <td>{week.review ? percentLabel(week.plannedDonePercent) : t('weeklyReview.trend.noReview')}</td>
              <td>{week.review ? overallLabel(week.overall) : t('weeklyReview.trend.noReview')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
