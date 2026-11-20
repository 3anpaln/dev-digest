import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

const createMessage = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMessage };
  },
}));

it.each([null, undefined])('warns about missing Anthropic usage (%s) and preserves the review', async (usage) => {
  const data = { summary: 'Review complete' };
  createMessage.mockResolvedValueOnce({ usage, content: [{ type: 'tool_use', input: data }] });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const onAttemptCost = vi.fn();
  const model = 'claude-3-5-sonnet-latest';
  try {
    const result = await new AnthropicProvider('test').completeStructured({
      model,
      schema: z.object({ summary: z.string() }),
      schemaName: 'Review',
      messages: [],
      onAttemptCost,
    });
    expect(result).toMatchObject({ data, tokensIn: 0, tokensOut: 0, costUsd: null });
    expect(onAttemptCost).toHaveBeenCalledTimes(1);
    expect(onAttemptCost).toHaveBeenCalledWith(null);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Anthropic structured response is missing usage metadata',
      { model, attempt: 1 },
    );
  } finally {
    warn.mockRestore();
  }
});
