import { nextConfigVersion, type AgentConfiguration, type AgentPatch } from '../domain/configuration.js';

export interface AgentUpdateStore {
  /** Plan against a locked row and commit the update and its version snapshot together. */
  update(
    workspaceId: string,
    agentId: string,
    plan: (current: AgentConfiguration) => { patch: AgentPatch; version: number },
  ): Promise<AgentConfiguration | undefined>;
}

export function updateAgent(
  store: AgentUpdateStore,
  workspaceId: string,
  agentId: string,
  patch: AgentPatch,
): Promise<AgentConfiguration | undefined> {
  return store.update(workspaceId, agentId, (current) => ({
    patch,
    version: nextConfigVersion(current, patch),
  }));
}
