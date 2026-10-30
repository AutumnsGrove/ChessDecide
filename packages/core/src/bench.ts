/**
 * Headless bench plans: validation, cell expansion, cap maths and the results report.
 * Pure: no DB, no clock, no network. Spec: docs/build/tasks/T13-headless-bench.md §3–§4.
 */
import { ARM_PRESETS, type ArmName } from './types.ts';
import type { SeriesSize } from './series.ts';

export class BenchPlanError extends Error {
  constructor(readonly field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = 'BenchPlanError';
  }
}

export interface BenchPlan {
  name: string;
  models: string[];
  arms: ArmName[];
  size: SeriesSize;
  ladder: { mode: 'adaptive' } | { mode: 'fixed'; level: string };
  ladder_version: number;
  series_cap_usd: number;
  run_cap_usd: number;
  repeat: number;
  concurrency: 1 | 2;
  parallel_models: number;                    // cells running at once, never two of the same model (1..4)
  judge_depth: number;
  max_hours: number;
  cell_timeout_min: number;
  artifacts: { sql: boolean };
  seed?: number;
}

export interface BenchCell { index: number; model: string; arm: ArmName; repeat: number; seriesName: string }
export type CellState = 'pending' | 'running' | 'finished' | 'budget' | 'failed' | 'timeout';
export type BenchStopReason = 'completed' | 'stopped_budget' | 'stopped_time' | 'stopped_error' | 'interrupted' | 'sliced';

const PLAN_KEYS = new Set([
  'name', 'models', 'arms', 'size', 'ladder', 'ladder_version', 'series_cap_usd', 'run_cap_usd',
  'repeat', 'concurrency', 'parallel_models', 'judge_depth', 'max_hours', 'cell_timeout_min', 'artifacts', 'seed',
]);
const SIZE_PRESETS = ['quick', 'standard', 'custom', 'completion'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new BenchPlanError(field, 'must be a non-empty string');
  return v;
}

function requireNumber(v: unknown, field: string, min: number, max: number): number {
  if (!isNum(v)) throw new BenchPlanError(field, 'must be a number');
  if (v < min || v > max) throw new BenchPlanError(field, `must be in ${min}..${max}`);
  return v;
}

function parseSize(v: unknown): SeriesSize {
  if (!isObject(v)) throw new BenchPlanError('size', 'must be an object');
  const preset = v.preset;
  if (typeof preset !== 'string' || !(SIZE_PRESETS as readonly string[]).includes(preset))
    throw new BenchPlanError('size.preset', `must be one of ${SIZE_PRESETS.join(', ')}`);
  if (preset === 'custom') {
    if (!Number.isInteger(v.games) || (v.games as number) < 1 || (v.games as number) > 400)
      throw new BenchPlanError('size.games', 'custom size.games must be an integer in 1..400');
    return { preset: 'custom', games: v.games as number };
  }
  if (preset === 'completion') {
    const out: SeriesSize = { preset: 'completion' };
    for (const k of ['target_half_width', 'min_games', 'max_games'] as const) {
      if (v[k] === undefined) continue;
      if (!isNum(v[k]) || (v[k] as number) <= 0) throw new BenchPlanError(`size.${k}`, 'must be positive');
      out[k] = v[k] as number;
    }
    return out;
  }
  return { preset: preset as 'quick' | 'standard' };
}

function parseLadder(v: unknown): BenchPlan['ladder'] {
  if (!isObject(v)) throw new BenchPlanError('ladder', 'must be an object');
  if (v.mode === 'adaptive') return { mode: 'adaptive' };
  if (v.mode === 'fixed') {
    if (typeof v.level !== 'string' || v.level === '') throw new BenchPlanError('ladder.level', 'fixed ladder needs a level id');
    return { mode: 'fixed', level: v.level };
  }
  throw new BenchPlanError('ladder.mode', 'must be adaptive or fixed');
}

export function parseBenchPlan(json: unknown): BenchPlan {
  if (!isObject(json)) throw new BenchPlanError('plan', 'must be a JSON object');
  for (const key of Object.keys(json)) if (!PLAN_KEYS.has(key)) throw new BenchPlanError(key, 'unknown key');

  const name = requireString(json.name, 'name');
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(name)) throw new BenchPlanError('name', 'must match ^[a-z0-9][a-z0-9-]{1,30}$');

  if (!Array.isArray(json.models) || json.models.length === 0) throw new BenchPlanError('models', 'must be a non-empty array');
  const models = json.models.map((m, i) => requireString(m, `models[${i}]`));
  if (new Set(models).size !== models.length) throw new BenchPlanError('models', 'must be unique');

  if (!Array.isArray(json.arms) || json.arms.length === 0) throw new BenchPlanError('arms', 'must be a non-empty array');
  const arms = json.arms.map((a, i) => {
    if (typeof a !== 'string' || !(a in ARM_PRESETS)) throw new BenchPlanError(`arms[${i}]`, `unknown arm "${String(a)}"`);
    return a as ArmName;
  });
  if (new Set(arms).size !== arms.length) throw new BenchPlanError('arms', 'must be unique');

  const size = parseSize(json.size);
  const ladder = parseLadder(json.ladder);

  if (!Number.isInteger(json.ladder_version) || (json.ladder_version as number) < 0)
    throw new BenchPlanError('ladder_version', 'must be a non-negative integer');
  const seriesCap = requireNumber(json.series_cap_usd, 'series_cap_usd', 0.01, 50);
  const runCap = requireNumber(json.run_cap_usd, 'run_cap_usd', 0.01, 50);
  if (runCap < seriesCap) throw new BenchPlanError('run_cap_usd', 'must be at least series_cap_usd');

  const repeat = json.repeat === undefined ? 1 : json.repeat;
  if (!Number.isInteger(repeat) || (repeat as number) < 1 || (repeat as number) > 5)
    throw new BenchPlanError('repeat', 'must be an integer in 1..5');
  const concurrency = json.concurrency === undefined ? 2 : json.concurrency;
  if (concurrency !== 1 && concurrency !== 2) throw new BenchPlanError('concurrency', 'must be 1 or 2');
  const parallelModels = json.parallel_models === undefined ? 1 : json.parallel_models;
  if (!Number.isInteger(parallelModels) || (parallelModels as number) < 1 || (parallelModels as number) > 4)
    throw new BenchPlanError('parallel_models', 'must be an integer in 1..4');
  const judgeDepth = json.judge_depth === undefined ? 14 : json.judge_depth;
  if (!Number.isInteger(judgeDepth) || (judgeDepth as number) < 6 || (judgeDepth as number) > 20)
    throw new BenchPlanError('judge_depth', 'must be an integer in 6..20');
  const maxHours = json.max_hours === undefined ? 8 : json.max_hours;
  if (!isNum(maxHours) || maxHours < 0.25 || maxHours > 48) throw new BenchPlanError('max_hours', 'must be in 0.25..48');
  const cellTimeout = json.cell_timeout_min === undefined ? 90 : json.cell_timeout_min;
  if (!isNum(cellTimeout) || cellTimeout < 5 || cellTimeout > 360) throw new BenchPlanError('cell_timeout_min', 'must be in 5..360');

  const artifactsRaw = json.artifacts === undefined ? {} : json.artifacts;
  if (!isObject(artifactsRaw)) throw new BenchPlanError('artifacts', 'must be an object');
  for (const key of Object.keys(artifactsRaw)) if (key !== 'sql') throw new BenchPlanError(`artifacts.${key}`, 'unknown key');
  if (artifactsRaw.sql !== undefined && typeof artifactsRaw.sql !== 'boolean')
    throw new BenchPlanError('artifacts.sql', 'must be a boolean');
  const sql = artifactsRaw.sql === undefined ? true : artifactsRaw.sql;

  if (json.seed !== undefined && (!Number.isInteger(json.seed) || (json.seed as number) < 0))
    throw new BenchPlanError('seed', 'must be a non-negative integer');

  return {
    name, models, arms, size, ladder,
    ladder_version: json.ladder_version as number,
    series_cap_usd: seriesCap, run_cap_usd: runCap,
    repeat: repeat as number, concurrency: concurrency as 1 | 2, parallel_models: parallelModels as number, judge_depth: judgeDepth as number,
    max_hours: maxHours, cell_timeout_min: cellTimeout,
    artifacts: { sql },
    ...(json.seed !== undefined ? { seed: json.seed as number } : {}),
  };
}

/** `<name>/` for the first run, `<name>@<stamp>/` for `--new` runs. */
export function planPrefix(plan: BenchPlan, stamp?: string): string {
  return stamp ? `${plan.name}@${stamp}/` : `${plan.name}/`;
}

/** Models (plan order) × arms (plan order) × repeat. */
export function expandCells(plan: BenchPlan, prefix: string): BenchCell[] {
  const cells: BenchCell[] = [];
  for (const model of plan.models)
    for (const arm of plan.arms)
      for (let r = 1; r <= plan.repeat; r++)
        cells.push({
          index: cells.length, model, arm, repeat: r,
          seriesName: `${prefix}${model}#${arm}${plan.repeat > 1 ? `/r${r}` : ''}`,
        });
  return cells;
}

/** A cell may never take more than what is left of the run cap (D5). */
export function seriesCapFor(plan: BenchPlan, spentUsd: number): number {
  return Math.max(0, Math.min(plan.series_cap_usd, plan.run_cap_usd - spentUsd));
}

export function cellState(row: { status: string; status_reason: string | null }, games = 0): CellState {
  switch (row.status) {
    case 'finished': return 'finished';
    case 'stopped_budget': return 'budget';
    case 'stopped_error': return 'failed';
    case 'aborted': return 'failed';
    default: return games > 0 ? 'running' : 'pending';
  }
}

// ---- report ----

export interface BenchCellResult {
  cell: BenchCell; seriesId: string | null; state: CellState;
  status: string; statusReason: string | null;
  games: number; target: number | null; costUsd: number;
  elo: { mean: number; lo: number; hi: number; games: number } | null;
  w: number; d: number; l: number;
  acpl: number | null; acceptableRate: number | null; blunderRate: number | null;
  blocks: { levelId: string; levelElo: number; games: number; score: number }[];
  abortedGames: number;
  startedAt: string | null; finishedAt: string | null;
}

export interface BenchReportInput {
  runId: string; plan: BenchPlan; planPath: string; planSha256: string; prefix: string;
  env: { node: string; stockfish: string; gitSha: string | null; host: string; mock: boolean };
  ladder: { version: number; calibrated: boolean; file: string | null };
  startedAt: string; finishedAt: string | null; stopReason: BenchStopReason;
  cells: BenchCellResult[];
  pairs: { a: string; b: string; pAGtB: number; diffMean: number; diffLo: number; diffHi: number }[];
  /** Optional leaderboard rows (T09 shape) for summary.json; the CSV is written by the runner. */
  leaderboard?: readonly unknown[];
}

export interface BenchSummary {
  run: string;
  environment: BenchReportInput['env'];
  ladder: BenchReportInput['ladder'];
  caps: { series_usd: number; run_usd: number };
  totals: { cells: number; finished: number; games: number; aborted: number; cost_usd: number };
  cells: BenchCellResult[];
  pairs: BenchReportInput['pairs'];
  leaderboard: readonly unknown[];
}

const MODEL_WORDS = (slug: string) => slug.split('/').pop()!.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
export const benchLabel = (model: string, arm: string): string => `${MODEL_WORDS(model)} · ${arm}`;

const money = (n: number) => `$${n.toFixed(4)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)} %`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;
const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export function benchElapsed(startedAt: string, finishedAt: string | null): string {
  const end = finishedAt ? Date.parse(finishedAt) : Date.parse(startedAt);
  const minutes = Math.max(0, Math.round((end - Date.parse(startedAt)) / 60_000));
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

const sizeLabel = (size: SeriesSize) =>
  size.preset === 'custom' ? `custom (${size.games})` : size.preset === 'completion'
    ? `completion (${size.min_games ?? 25}–${size.max_games ?? 200})`
    : `${size.preset} (${size.preset === 'quick' ? 25 : 50})`;

const cellName = (c: BenchCellResult) => c.cell.seriesName.replace(c.cell.seriesName.split('/')[0] + '/', '');

export function benchReport(input: BenchReportInput): string {
  const { plan, env, ladder, cells } = input;
  const finished = cells.filter((c) => c.state === 'finished');
  const games = cells.reduce((n, c) => n + c.games, 0);
  const aborted = cells.reduce((n, c) => n + c.abortedGames, 0);
  const spend = cells.reduce((n, c) => n + c.costUsd, 0);
  const lines: string[] = [];

  lines.push(`# Bench run ${input.runId}`, '');
  if (env.mock) lines.push('**MOCK RUN — do not compare**', '');
  if (!ladder.calibrated) lines.push('**uncalibrated ruler — do not compare**', '');
  lines.push(
    `Plan \`${input.planPath}\` (sha256 ${input.planSha256.slice(0, 16)}…) · seed ${plan.seed ?? input.runId} · judge depth ${plan.judge_depth} · concurrency ${plan.concurrency}`,
    `Ladder v${ladder.version} (${ladder.calibrated ? 'calibrated' : 'uncalibrated'}) · size ${sizeLabel(plan.size)} · caps ${money(plan.series_cap_usd)} per series, ${money(plan.run_cap_usd)} per run`,
    `Ran ${utc(input.startedAt)} → ${utc(input.finishedAt ?? input.startedAt)} (${benchElapsed(input.startedAt, input.finishedAt)}) · node ${env.node} · Stockfish ${env.stockfish} · git ${env.gitSha?.slice(0, 7) ?? 'unknown'}`,
    `**Spend ${money(spend)} of ${money(plan.run_cap_usd)}** · ${cells.length} cells: ${finished.length} finished · ${games} games · ${aborted} aborted`,
    '',
  );

  lines.push('| Model · arm | Series | Elo (95 %) | W-D-L | Score | ACPL | Acc. | Blunders | Cost | Games |');
  lines.push('| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const c of cells) {
    const elo = c.elo
      ? `**${Math.round(c.elo.mean)} ± ${Math.round((c.elo.hi - c.elo.lo) / 2)}** (${Math.round(c.elo.lo)}–${Math.round(c.elo.hi)})`
      : '—';
    const score = c.games ? `${Math.round(((c.w + 0.5 * c.d) / c.games) * 100)} %` : '—';
    lines.push('| ' + [
      `**${benchLabel(c.cell.model, c.cell.arm)}**`, c.seriesId ? `\`${c.seriesId.slice(0, 10)}…\`` : '—',
      elo, `${c.w}-${c.d}-${c.l}`, score,
      c.acpl === null ? '—' : c.acpl.toFixed(1), c.acceptableRate === null ? '—' : pct(c.acceptableRate),
      c.blunderRate === null ? '—' : pct(c.blunderRate), money(c.costUsd), String(c.games),
    ].join(' | ') + ' |');
  }
  lines.push('');

  if (input.pairs.length) {
    lines.push('## Separated pairs (METRICS.md B6)', '');
    lines.push('| A vs B | P(A stronger) | Elo gap (95 %) | Verdict |');
    lines.push('| --- | ---: | --- | --- |');
    for (const p of input.pairs) {
      const separated = p.diffLo > 0 || p.diffHi < 0;
      lines.push(`| ${p.a} vs ${p.b} | ${pct(p.pAGtB)} | ${signed(p.diffMean)} (${signed(p.diffLo)} … ${signed(p.diffHi)}) | ${separated ? '**separated**' : '≈ not separable'} |`);
    }
    lines.push('');
  }

  const levelIds = [...new Set(cells.flatMap((c) => c.blocks.map((b) => b.levelId)))];
  if (levelIds.length) {
    lines.push('## Ladder walk', '');
    lines.push(`| Model · arm | ${levelIds.join(' | ')} |`);
    lines.push(`| --- | ${levelIds.map(() => '---:').join(' | ')} |`);
    for (const c of cells) {
      const byLevel = new Map(c.blocks.map((b) => [b.levelId, b]));
      lines.push(`| ${benchLabel(c.cell.model, c.cell.arm)} | ${levelIds.map((id) => {
        const b = byLevel.get(id);
        return b ? `${Math.round(b.score * 100)} %` : '—';
      }).join(' | ')} |`);
    }
    lines.push('');
  }

  const unfinished = cells.filter((c) => c.state !== 'finished');
  if (unfinished.length) {
    lines.push('## Not finished', '');
    for (const c of unfinished)
      lines.push(`- cell ${c.cell.index} (${cellName(c)}, ${c.state}) ${c.status} at ${c.games}${c.target ? `/${c.target}` : ''} games, ${money(c.costUsd)}${c.statusReason ? ` — ${c.statusReason}` : ''}`);
    lines.push('');
  }

  lines.push('## Provenance', '');
  lines.push(`- plan: \`${input.planPath}\` sha256 ${input.planSha256} · seed ${plan.seed ?? input.runId} · host \`${env.host}\``);
  lines.push(`- ladder: ${input.ladder.file ?? `v${ladder.version}`} · stop reason: ${input.stopReason}`);
  return lines.join('\n') + '\n';
}

export function benchSummary(input: BenchReportInput): BenchSummary {
  return {
    run: input.runId,
    environment: input.env,
    ladder: input.ladder,
    caps: { series_usd: input.plan.series_cap_usd, run_usd: input.plan.run_cap_usd },
    totals: {
      cells: input.cells.length,
      finished: input.cells.filter((c) => c.state === 'finished').length,
      games: input.cells.reduce((n, c) => n + c.games, 0),
      aborted: input.cells.reduce((n, c) => n + c.abortedGames, 0),
      cost_usd: input.cells.reduce((n, c) => n + c.costUsd, 0),
    },
    cells: input.cells,
    pairs: input.pairs,
    leaderboard: input.leaderboard ?? [],
  };
}
