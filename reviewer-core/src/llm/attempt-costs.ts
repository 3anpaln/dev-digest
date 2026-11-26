/** Cost accounting for one structured request, which may dispatch several attempts. */
export class AttemptCosts {
  total: number | null = 0;
  private blockedBeforeDispatch = false;

  constructor(
    private readonly model: string,
    private readonly estimate?: (model: string, input: number, output: number) => number | null,
    private readonly onAttemptCost?: (usd: number | null) => void,
    private readonly checkCancelled?: () => void,
    private readonly onDispatch?: () => void,
  ) {}

  beforeAttempt = (retryCount = 0): void => {
    // A transport retry follows an already dispatched attempt of unknown cost.
    if (retryCount > 0) this.record(null);
    this.blockedBeforeDispatch = true;
    this.checkCancelled?.();
    this.onDispatch?.();
    this.blockedBeforeDispatch = false;
  };

  record = (usd: number | null): void => {
    const cost = validCost(usd) ? usd : null;
    this.total = cost === null || this.total === null ? null : this.total + cost;
    this.onAttemptCost?.(cost);
  };

  response(reported: unknown, input?: number, output?: number): void {
    let usd: number | null = null;
    if (validCost(reported)) {
      usd = reported;
    } else if (validCount(input) && validCount(output)) {
      usd = this.estimate?.(this.model, input, output) ?? null;
    }
    this.record(usd);
  }

  failed = (error: unknown): never => {
    // A blocked dispatch throws the caller's cancellation signal.
    if (this.blockedBeforeDispatch) throw error;
    this.record(null);

    // Keep the fields retry policies use without exposing provider messages,
    // response bodies, headers, or causes to callers and run logs.
    const failure = error as {
      status?: unknown;
      statusCode?: unknown;
      response?: { status?: unknown };
      code?: unknown;
    } | null;
    const rawStatus = failure?.status ?? failure?.statusCode ?? failure?.response?.status;
    const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus)
      && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : undefined;
    const rawCode = failure?.code;
    const code = rawCode === 'ECONNRESET' || rawCode === 'ETIMEDOUT' || rawCode === 'ENOTFOUND'
      ? rawCode : undefined;
    const message = status === undefined
      ? 'Provider request failed'
      : `Provider request failed (HTTP ${status})`;
    throw Object.assign(new Error(message), { status, code });
  };
}

function validCost(cost: unknown): cost is number {
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0;
}

function validCount(count: number | undefined): count is number {
  return typeof count === 'number' && Number.isInteger(count) && count >= 0;
}
