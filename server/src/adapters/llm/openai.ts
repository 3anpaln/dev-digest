import { AttemptCosts, ReviewOpenAIClient } from '@devdigest/reviewer-core';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { toJsonSchema, parseWithRepair } from '../../platform/structured.js';
import { estimateCost } from './pricing.js';
import { ExternalServiceError, ResponseTokenLimitError } from '../../platform/errors.js';

const DEFAULT_TIMEOUT = 60_000;
const EMBED_MODEL = 'text-embedding-3-small';

/**
 * GPT-5 and the o-series reasoning models reject a custom `temperature` (only
 * the default is allowed) and use `max_completion_tokens` instead of
 * `max_tokens`. Detect them so we can omit/remap those params.
 */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o1|o3|o4)/.test(model);
}

/** Build the temperature + token-cap params appropriate for the given model. */
function tuningParams(
  model: string,
  temperature: number | undefined,
  maxTokens: number | undefined,
): Record<string, number> {
  if (isReasoningModel(model)) {
    return maxTokens ? { max_completion_tokens: maxTokens } : {};
  }
  const p: Record<string, number> = { temperature: temperature ?? 0 };
  if (maxTokens) p.max_tokens = maxTokens;
  return p;
}

/**
 * OpenAI LLMProvider.
 * - listModels: dynamic via GET /models (not hardcoded).
 * - completeStructured: response_format json_schema + Zod validate + reprompt.
 * - embed: text-embedding-3-small (1536 dims).
 */
export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai' as const;
  private client: ReviewOpenAIClient;

  constructor(apiKey: string) {
    this.client = new ReviewOpenAIClient({ apiKey });
  }

  async listModels(): Promise<ModelInfo[]> {
    return withRetry(async () => {
      const res = await this.client.models.list();
      return res.data
        .filter((m) => m.id.startsWith('gpt') || m.id.includes('o1') || m.id.includes('o3'))
        .map((m) => ({ id: m.id, provider: 'openai' as const, created: m.created }));
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return withRetry(() =>
      withTimeout(this.doComplete(req), req.timeoutMs ?? DEFAULT_TIMEOUT),
    );
  }

  private async doComplete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await this.client.chat.completions.create({
      model: req.model,
      messages: req.messages,
      ...tuningParams(req.model, req.temperature ?? 0.2, req.maxTokens),
    });
    const text = res.choices?.[0]?.message?.content ?? '';
    const tokensIn = res.usage?.prompt_tokens ?? 0;
    const tokensOut = res.usage?.completion_tokens ?? 0;
    return {
      text,
      model: req.model,
      tokensIn,
      tokensOut,
      costUsd: estimateCost(req.model, tokensIn, tokensOut),
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const maxRetries = req.maxRetries ?? 2;
    const messages = [...req.messages];
    let tokensIn = 0;
    let tokensOut = 0;
    let lastRaw = '';
    const costs = new AttemptCosts(req.model, estimateCost, req.onAttemptCost, req.checkCancelled, req.onAttemptDispatch);
    const options = { timeout: req.timeoutMs ?? DEFAULT_TIMEOUT, beforeAttempt: costs.beforeAttempt };

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const res = await withRetry(() =>
        withTimeout(
          this.client.chat.completions.create({
            model: req.model,
            messages,
            ...tuningParams(req.model, req.temperature, req.maxTokens),
            response_format: {
              type: 'json_schema',
              json_schema: { name: req.schemaName, schema: jsonSchema.schema, strict: true },
            },
          }, options),
          options.timeout,
        ).catch(costs.failed),
      );
      costs.response(
        (res.usage as { cost?: number } | null)?.cost,
        res.usage?.prompt_tokens,
        res.usage?.completion_tokens,
      );
      lastRaw = res.choices?.[0]?.message?.content ?? '';
      tokensIn += res.usage?.prompt_tokens ?? 0;
      tokensOut += res.usage?.completion_tokens ?? 0;
      if (req.rejectTruncated && res.choices?.[0]?.finish_reason === 'length') throw new ResponseTokenLimitError();

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: costs.total,
          raw: lastRaw,
          attempts: attempt,
        };
      }
      // reprompt-on-error
      messages.push({ role: 'assistant', content: lastRaw });
      messages.push({ role: 'user', content: parsed.repromptMessage });
    }

    throw new ExternalServiceError('OpenAI structured output failed schema validation');
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return withRetry(async () => {
      const res = await withTimeout(
        this.client.embeddings.create({ model: EMBED_MODEL, input: texts }),
        DEFAULT_TIMEOUT,
      );
      return res.data.map((d) => d.embedding);
    });
  }
}
