import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { getCompengDir, getMemoryIndexImportPath, getMemoryIndexPath } from '../paths';
import { isSelfImproveEnabled, isSelfImproveEnabledForPath } from '../setting';
import { SELF_IMPROVE_NUDGE } from '../nudge';

/** The app's project list, as the project store holds it */
const projects = vi.hoisted((): Array<{ path: string; settings: { selfImprove?: boolean } }> => []);
vi.mock('../../project-store', () => ({ projectStore: { getProjects: () => projects } }));

let project: string;

beforeEach(async () => {
  project = await mkdtemp(path.join(os.tmpdir(), 'wb-selfimprove-paths-'));
  // The switch only exists for an initialized project, which is what `.workbench` marks
  await mkdir(path.join(project, '.workbench'), { recursive: true });
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

describe('paths', () => {
  it('keeps the memory folder out of .workbench/knowledge', () => {
    // .workbench/knowledge existing is what turns the project's Use Graphify switch on
    // (graphify-paths.ts), so this feature must never write inside it
    expect(getCompengDir(project)).toBe(path.join(project, '.workbench', 'compeng'));
    expect(getCompengDir(project)).not.toContain(path.join('.workbench', 'knowledge'));
    expect(getMemoryIndexPath(project)).toBe(path.join(getCompengDir(project), 'MEMORY.md'));
  });

  it('imports the index with a path relative to the project root, forward slashes', () => {
    expect(getMemoryIndexImportPath()).toBe('.workbench/compeng/MEMORY.md');
  });
});

describe('isSelfImproveEnabledForPath', () => {
  const setAppSettings = (settings: { selfImprove?: boolean } | undefined) => {
    projects.splice(0, projects.length, ...(settings ? [{ path: project, settings }] : []));
  };

  it('is false for a path the app has no project for, and for an undefined path', async () => {
    setAppSettings(undefined);
    expect(await isSelfImproveEnabledForPath(project)).toBe(false);
    expect(await isSelfImproveEnabledForPath(undefined)).toBe(false);
  });

  it("is true only when the app's switch is explicitly on", async () => {
    setAppSettings({ selfImprove: true });
    expect(await isSelfImproveEnabledForPath(project)).toBe(true);
    expect(await isSelfImproveEnabledForPath(path.join(project, '.'))).toBe(true);

    setAppSettings({ selfImprove: false });
    expect(await isSelfImproveEnabledForPath(project)).toBe(false);

    setAppSettings({});
    expect(await isSelfImproveEnabledForPath(project)).toBe(false);
  });

  it("ignores a switch committed to the project's own settings file", async () => {
    setAppSettings({});
    await writeFile(path.join(project, '.workbench', 'settings.json'), JSON.stringify({ selfImprove: true }));
    expect(await isSelfImproveEnabledForPath(project)).toBe(false);
  });
});

describe('isSelfImproveEnabled', () => {
  it('defaults to off', () => {
    expect(isSelfImproveEnabled(undefined)).toBe(false);
    expect(isSelfImproveEnabled({})).toBe(false);
    expect(isSelfImproveEnabled({ selfImprove: false })).toBe(false);
    expect(isSelfImproveEnabled({ selfImprove: true })).toBe(true);
  });
});

describe('the nudge', () => {
  it('states when to save, the bar, and what to do with a contradiction', () => {
    expect(SELF_IMPROVE_NUDGE).toContain('type: feedback');
    expect(SELF_IMPROVE_NUDGE).toMatch(/newer one wins/i);
    expect(SELF_IMPROVE_NUDGE).toMatch(/CLAUDE\.md already make clear/i);
    expect(SELF_IMPROVE_NUDGE).toMatch(/never record secrets/i);
  });

  it("has no single quotes, so it survives an agent window's shell-quoted flag", () => {
    expect(SELF_IMPROVE_NUDGE).not.toContain("'");
  });
});
