/**
 * Where the work went: one row per project with work in the week, a bar of the tasks it finished
 * in its color and a lighter segment for the planned tasks still open, on one scale for all rows.
 */
import { useTranslation } from 'react-i18next';
import type { ProjectWork } from '../../../shared/utils/weekly-review';
import type { ReviewProjects } from './review-projects';

/** Opacity of the open segment: the project's hue, a lighter step */
const OPEN_OPACITY = 0.3;

interface ProjectBreakdownProps {
  rows: ProjectWork[];
  projects: ReviewProjects;
  isCurrent: boolean;
}

export function ProjectBreakdown({ rows, projects, isCurrent }: ProjectBreakdownProps) {
  const { t } = useTranslation('tasks');
  if (rows.length === 0) {
    return (
      <p className="text-sm text-(--nav-label-color)">
        {t(isCurrent ? 'weeklyReview.projects.emptyThisWeek' : 'weeklyReview.projects.empty')}
      </p>
    );
  }
  const most = Math.max(1, ...rows.map((row) => row.done + row.open));

  return (
    <div>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const name = projects.name(row.projectId);
          const color = projects.color(row.projectId);
          const counts = t('weeklyReview.projects.counts', { done: row.done, open: row.open });
          return (
            <li
              key={row.projectId}
              aria-label={`${name}: ${counts}`}
              data-review-project={row.projectId}
              className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3"
            >
              <span className="truncate text-sm text-foreground" title={name}>
                {name}
              </span>
              <div aria-hidden="true" className="flex h-2 min-w-0 items-stretch" style={{ gap: row.done && row.open ? 2 : 0 }}>
                {row.done > 0 && (
                  <div
                    className={row.open > 0 ? '' : 'rounded-r-[4px]'}
                    style={{ width: `${(row.done / most) * 100}%`, backgroundColor: color }}
                  />
                )}
                {row.open > 0 && (
                  <div
                    className="rounded-r-[4px]"
                    style={{ width: `${(row.open / most) * 100}%`, backgroundColor: color, opacity: OPEN_OPACITY }}
                  />
                )}
              </div>
              <span aria-hidden="true" className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                {counts}
              </span>
            </li>
          );
        })}
      </ul>

      <ul aria-label={t('weeklyReview.projects.legend')} className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
        <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className="h-2 w-3 rounded-[2px] bg-foreground/70" />
          {t('weeklyReview.projects.legendDone')}
        </li>
        <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className="h-2 w-3 rounded-[2px] bg-foreground/20" />
          {t('weeklyReview.projects.legendOpen')}
        </li>
      </ul>
    </div>
  );
}
