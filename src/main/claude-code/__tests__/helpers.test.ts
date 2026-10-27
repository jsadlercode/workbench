import { describe, it, expect } from 'vitest';
import { buildMcpConfig } from '../mcp-config';
import { resolveClaudeCodeTaskSettings } from '../settings';
import { applyPlanningPolicy, fixedTriage } from '../triage';
import { isClaudeRunFinished, normalizeValidation } from '../task-runner';
import { DEFAULT_CLAUDE_CODE_TASK_SETTINGS } from '../../../shared/types/claude-code';

describe('buildMcpConfig', () => {
  it('maps built-in and tested custom connectors to --mcp-config servers', () => {
    const config = buildMcpConfig(['context7', 'my server', 'untested'], {
      customServers: [
        { id: 'my server', name: 'My Server', type: 'http', url: 'https://example.com/mcp', verified: true },
        { id: 'untested', name: 'Untested', type: 'command', command: 'npx', verified: false },
      ],
    } as never);
    expect(Object.keys(config.mcpServers)).toEqual(['context7', 'My_Server']);
    expect(config.mcpServers.My_Server).toEqual({ type: 'http', url: 'https://example.com/mcp', headers: undefined });
  });

  it('uses the Connectors defaults when the task has no choice', () => {
    expect(Object.keys(buildMcpConfig(undefined, undefined).mcpServers)).toEqual(['context7']);
    expect(buildMcpConfig([], undefined).mcpServers).toEqual({});
  });
});

describe('resolveClaudeCodeTaskSettings', () => {
  it('fills defaults and drops invalid values', () => {
    expect(resolveClaudeCodeTaskSettings(undefined)).toEqual(DEFAULT_CLAUDE_CODE_TASK_SETTINGS);
    const resolved = resolveClaudeCodeTaskSettings({ fixedModel: 'gpt' as never, planning: 'sometimes' as never, validation: false });
    expect(resolved.fixedModel).toBe('sonnet');
    expect(resolved.planning).toBe('auto');
    expect(resolved.validation).toBe(false);
  });
});

describe('planning policy', () => {
  it('overrides the triage decision', () => {
    const base = fixedTriage(DEFAULT_CLAUDE_CODE_TASK_SETTINGS, 'T', 'fixed', '');
    expect(applyPlanningPolicy(base, { ...DEFAULT_CLAUDE_CODE_TASK_SETTINGS, planning: 'always' }).needsPlan).toBe(true);
    expect(applyPlanningPolicy({ ...base, needsPlan: true }, { ...DEFAULT_CLAUDE_CODE_TASK_SETTINGS, planning: 'never' }).needsPlan).toBe(false);
  });
});

describe('isClaudeRunFinished', () => {
  const run = (phases: Array<Record<string, unknown>>) => ({ version: 1 as const, phases, subagents: [], totalCostUsd: 0, updatedAt: '' }) as never;
  const done = { startedAt: 'a', endedAt: 'b' };

  it('is finished after a successful validation, or implementation when validation is off', () => {
    expect(isClaudeRunFinished(run([{ name: 'implement', ...done }, { name: 'validate', ...done }]), true)).toBe(true);
    expect(isClaudeRunFinished(run([{ name: 'implement', ...done }]), true)).toBe(false);
    expect(isClaudeRunFinished(run([{ name: 'implement', ...done }]), false)).toBe(true);
  });

  it('is not finished when the last step failed or is still running', () => {
    expect(isClaudeRunFinished(run([{ name: 'validate', ...done, isError: true }]), true)).toBe(false);
    expect(isClaudeRunFinished(run([{ name: 'validate', startedAt: 'a' }]), true)).toBe(false);
    expect(isClaudeRunFinished(null, true)).toBe(false);
  });
});

describe('normalizeValidation', () => {
  const report = (fields: Record<string, unknown>) => ({ status: 'passed', summary: 'Done', checks: [], findings: [], ...fields });

  it('keeps the steps left for the user, trimmed and in order', () => {
    const { yourSteps } = normalizeValidation(report({ yourSteps: ['  Send the email in drafts/intro.md to Sam ', 'Add STRIPE_KEY to the CI secrets'] }));
    expect(yourSteps).toEqual(['Send the email in drafts/intro.md to Sam', 'Add STRIPE_KEY to the CI secrets']);
  });

  it('drops empty, duplicate and non-string steps', () => {
    const { yourSteps } = normalizeValidation(report({ yourSteps: ['Call the venue', '', '   ', 42, null, 'Call the venue', { text: 'x' }, 'Test on an iPhone'] }));
    expect(yourSteps).toEqual(['Call the venue', 'Test on an iPhone']);
  });

  it('keeps at most 10 steps', () => {
    const steps = Array.from({ length: 14 }, (_, i) => `Step ${i + 1}`);
    const { yourSteps } = normalizeValidation(report({ yourSteps: steps }));
    expect(yourSteps).toEqual(steps.slice(0, 10));
  });

  it('gives an empty list when the report has none or no valid list', () => {
    expect(normalizeValidation(report({ yourSteps: [] })).yourSteps).toEqual([]);
    expect(normalizeValidation(report({})).yourSteps).toEqual([]);
    expect(normalizeValidation(report({ yourSteps: 'Send the email' })).yourSteps).toEqual([]);
    expect(normalizeValidation(undefined, 'Fallback summary')).toEqual({
      status: 'partial',
      summary: 'Fallback summary',
      checks: [],
      findings: [],
      yourSteps: [],
    });
  });
});
