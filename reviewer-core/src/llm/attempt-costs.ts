/** Cost accounting for one structured request, which may dispatch several attempts. */
export class AttemptCosts {
  total: number | null = 0;

  constructor(
    private readonly model: string,
    private readonly estimate?: (model: string, input: number, output: number) => number | null,
    private readonly onAttemptCost?: (usd: number | null) => void,
  ) {}

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
    this.record(null);
    throw error;
  };
}

function validCost(cost: unknown): cost is number {
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0;
}

function validCount(count: number | undefined): count is number {
  return typeof count === 'number' && Number.isInteger(count) && count >= 0;
}
