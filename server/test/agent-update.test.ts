import { describe, expect, it } from 'vitest';
import { updateAgent, type AgentUpdateStore } from '../src/modules/agents/application/update-agent.js';
import type { AgentConfiguration, AgentPatch } from '../src/modules/agents/domain/configuration.js';

const current: AgentConfiguration = {
  id: 'agent',
  name: 'Reviewer',
  description: '',
  provider: 'openai',
  model: 'gpt-4o-mini',
  systemPrompt: 'Review the diff.',
  outputSchema: { type: 'object' },
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: false,
  enabled: true,
  version: 4,
};

describe('updateAgent', () => {
  it.each<{ patch: AgentPatch; version: number }>([
    { patch: { enabled: false }, version: 4 },
    { patch: { model: current.model }, version: 4 },
    { patch: { model: 'gpt-4o' }, version: 5 },
    { patch: { outputSchema: null }, version: 5 },
    { patch: { outputSchema: current.outputSchema }, version: 5 },
  ])('plans $patch at version $version', async ({ patch, version }) => {
    const store: AgentUpdateStore = {
      async update(workspaceId, agentId, plan) {
        expect(workspaceId).toBe('workspace');
        expect(agentId).toBe(current.id);
        const update = plan(current);
        return { ...current, ...update.patch, version: update.version };
      },
    };

    expect(await updateAgent(store, 'workspace', current.id, patch)).toEqual({ ...current, ...patch, version });
  });
});
