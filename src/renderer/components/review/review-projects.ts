/**
 * Project names and chart colors for the weekly review. A project's color follows its place in
 * the project list (the categorical chart slots --chart-1 to --chart-8, fixed order), never its
 * rank in a week, so a project keeps its color from week to week; past the eighth, projects share
 * one neutral.
 */
import { useMemo } from 'react';
import type { Project } from '../../../shared/types';

const CHART_SLOTS = 8;

export interface ReviewProjects {
  name: (projectId: string) => string;
  color: (projectId: string) => string;
}

export function useReviewProjects(projects: readonly Project[], fallbackName: string): ReviewProjects {
  return useMemo(() => {
    const index = new Map(projects.map((project, i) => [project.id, i]));
    const names = new Map(projects.map((project) => [project.id, project.name]));
    return {
      name: (projectId) => names.get(projectId) ?? fallbackName,
      color: (projectId) => {
        const i = index.get(projectId);
        return i !== undefined && i < CHART_SLOTS ? `var(--chart-${i + 1})` : 'var(--chart-other)';
      }
    };
  }, [projects, fallbackName]);
}

/** A short weekday name for a `YYYY-MM-DD` day or a time ("Mon") */
export function weekdayName(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}
