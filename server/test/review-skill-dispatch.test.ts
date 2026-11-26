import { describe, expect, it, vi } from 'vitest';
import type { StructuredRequest } from '@devdigest/shared';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { Container } from '../src/platform/container.js';
import { RunBus } from '../src/platform/sse.js';
import { ReviewRunExecutor, type ReviewJob } from '../src/modules/reviews/run-executor.js';
import type { PullRow, ReviewRepository } from '../src/modules/reviews/repository.js';

const runId = 'review-run';
const diff = [
  'diff --git a/file.ts b/file.ts',
  '--- a/file.ts',
  '+++ b/file.ts',
  '@@ -1 +1,2 @@',
  ' export const a = 1;',
  '+export const b = 2;',
].join('\n');

describe('review skill dispatch persistence', () => {
  it.each(['done', 'failed', 'cancelled'] as const)('waits to finalize a %s trace until the dispatch write settles', async (status) => {
    let releaseDispatch!: () => void;
    const dispatchGate = new Promise<void>((resolve) => { releaseDispatch = resolve; });
    const runBus = new RunBus();
    class Provider extends MockLLMProvider {
      override async completeStructured<T>(request: StructuredRequest<T>) {
        const result = await super.completeStructured(request);
        if (status === 'cancelled') runBus.cancel(runId);
        return result;
      }
    }
    const llm = new Provider('openai', {
      structured: status === 'failed' ? {} : { verdict: 'approve', summary: 'Reviewed', score: 100, findings: [] },
    });
    const container = { runBus, llm: async () => llm, git: new MockGitClient({ diff }) } as unknown as Container;
    const store = {
      recordSkillDispatch: vi.fn<ReviewRepository['recordSkillDispatch']>(() => dispatchGate),
      insertReview: vi.fn(async () => ({ id: 'review' })),
      insertFindings: vi.fn(async () => []),
      markReviewed: vi.fn(async () => undefined),
      completeAgentRun: vi.fn(async () => true),
      saveRunTrace: vi.fn(async () => undefined),
    };
    const repository = {
      ...store,
      transaction: (work: (repo: typeof store) => Promise<unknown>) => work(store),
    } as unknown as ReviewRepository;
    const skill = { id: 'skill', name: 'Review guidance', version: 1 };
    const job: ReviewJob = {
      runId,
      agent: {
        name: 'Reviewer', provider: 'openai', model: 'test', systemPrompt: 'Review',
        repoIntel: false, strategy: 'single-pass', version: 1,
      } as ReviewJob['agent'],
      skills: [skill],
      skillBodies: ['Review guidance'],
      skillConfigurationFailed: false,
    };
    const executor = new ReviewRunExecutor(container, repository);
    const execution = executor.executeRuns(
      'workspace',
      { id: 'pr', number: 1, title: 'Change', author: 'Author' } as PullRow,
      { owner: 'owner', name: 'repo' } as Parameters<ReviewRunExecutor['executeRuns']>[2],
      [job],
    );
    try {
      const completionLog = { done: 'Citation grounding:', failed: 'Run failed:', cancelled: 'Run cancelled by user' }[status];
      await vi.waitFor(() => expect(runBus.buffer(runId).some(({ msg }) => msg.startsWith(completionLog))).toBe(true));
      expect(store.recordSkillDispatch).toHaveBeenCalledTimes(1);
      expect(store.completeAgentRun).not.toHaveBeenCalled();
      expect(store.saveRunTrace).not.toHaveBeenCalled();
    } finally {
      releaseDispatch();
      await execution;
    }

    expect(store.completeAgentRun).toHaveBeenCalledWith(runId, expect.objectContaining({ status }));
    expect(store.saveRunTrace).toHaveBeenCalledWith(
      runId, expect.objectContaining({ skills_used: [skill] }), store.recordSkillDispatch.mock.calls[0]?.[1],
    );
  });
});
