import type { Agent, AgentVersion } from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import type { AgentVersionRow } from './repository.js';
import type { AgentConfiguration } from './domain/configuration.js';

/** Map the agent configuration to the public `Agent` DTO. */
export function toAgentDto(row: AgentConfiguration): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider,
    model: row.model,
    system_prompt: row.systemPrompt,
    output_schema: row.outputSchema ?? null,
    enabled: row.enabled,
    version: row.version,
    strategy: row.strategy,
    ci_fail_on: row.ciFailOn,
    repo_intel: row.repoIntel,
  };
}

/**
 * Map a persisted `agent_versions` row to the public `AgentVersion` DTO. The
 * stored `config_json` is untyped jsonb (a snapshot from an older config shape
 * could drift), so it is parsed through `AgentVersionConfig` — a malformed
 * snapshot throws here rather than leaking an unvalidated blob to the client.
 */
export function toAgentVersionDto(row: AgentVersionRow): AgentVersion {
  return {
    agent_id: row.agentId,
    version: row.version,
    config: AgentVersionConfig.parse(row.configJson),
    created_at: row.createdAt.toISOString(),
  };
}

