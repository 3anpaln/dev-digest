/** Cost accounting for one structured request, which may dispatch several attempts. */
export class AttemptCosts {
  total: number | null = 0;

  constructor(
    private readonly model: string,
    private readonly estimate?: (model: string, input: number, output: number) => number | null,
    private readonly onAttemptCost?: (usd: number | null) => void,
  ) {}

  record = (usd: number | null): void => {
    this.total = usd === null || this.total === null ? null : this.total + usd;
    this.onAttemptCost?.(usd);
  };

  response(reported: unknown, input?: number, output?: number): void {
    let usd: number | null = null;
    if (typeof reported === 'number' && Number.isFinite(reported) && reported >= 0) {
      usd = reported;
    } else if (validCount(input) && validCount(output)) {
      usd = this.estimate?.(this.model, input, output) ?? null;
    }
    this.record(usd !== null && Number.isFinite(usd) && usd >= 0 ? usd : null);
  }

  failed = (error: unknown): never => {
    this.record(null);
    throw error;
  };
}

function validCount(count: number | undefined): count is number {
  return typeof count === 'number' && Number.isInteger(count) && count >= 0;
}
