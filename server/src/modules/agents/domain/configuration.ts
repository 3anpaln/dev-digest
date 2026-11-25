import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared/contracts/knowledge';

export interface AgentConfiguration {
  id: string;
  name: string;
  description: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema: unknown;
  strategy: ReviewStrategy;
  ciFailOn: CiFailOn;
  repoIntel: boolean;
  enabled: boolean;
  version: number;
}

export type AgentPatch = Partial<Omit<AgentConfiguration, 'id' | 'version'>>;

export function nextConfigVersion(current: AgentConfiguration, patch: AgentPatch): number {
  const changed =
    (patch.name !== undefined && patch.name !== current.name) ||
    (patch.description !== undefined && patch.description !== current.description) ||
    (patch.provider !== undefined && patch.provider !== current.provider) ||
    (patch.model !== undefined && patch.model !== current.model) ||
    (patch.systemPrompt !== undefined && patch.systemPrompt !== current.systemPrompt) ||
    (patch.strategy !== undefined && patch.strategy !== current.strategy) ||
    (patch.ciFailOn !== undefined && patch.ciFailOn !== current.ciFailOn) ||
    (patch.repoIntel !== undefined && patch.repoIntel !== current.repoIntel) ||
    // A supplied schema is a new version, including an explicit clear.
    patch.outputSchema !== undefined;

  return changed ? current.version + 1 : current.version;
}
