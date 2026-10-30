import { legalMoves, lastFen, type BudgetPort, type Game } from '@chessdecide/core';

/** docs/PROMPTS.md §10. Conservative estimate of one call's input cost in USD. */
export function estimateCallUsd(
  nOptions: number, pricePerMInput: number, stateVariant: 'slim' | 'full' = 'slim',
  rollingMeanTokens?: number, extraInputTokens = 0,
): number {
  // A measured mean already reflects the arm (including image tokens); only the formula adds the extra.
  const tokens = rollingMeanTokens ?? (stateVariant === 'slim' ? 400 + 45 * nOptions : 400 + 75 * nOptions) + extraInputTokens;
  return (tokens / 1e6) * pricePerMInput;
}

/** Hard cap per game: allowed iff spent + estimate(next call) <= cap (equality allowed). */
export function gameBudget(opts: { capUsd: number; pricePerMInput: number; stateVariant?: 'slim' | 'full'; rollingMeanTokens?: () => number | undefined }): BudgetPort {
  return {
    check(game: Game) {
      const n = legalMoves(lastFen(game)).length;
      const est = estimateCallUsd(n, opts.pricePerMInput, opts.stateVariant, opts.rollingMeanTokens?.());
      const ok = game.cost_usd + est <= opts.capUsd + 1e-12;
      return ok ? { ok } : { ok, reason: `budget: spent ${game.cost_usd.toFixed(6)} + est ${est.toFixed(6)} > cap ${opts.capUsd}` };
    },
  };
}
