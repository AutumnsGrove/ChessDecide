import { describe, expect, it } from 'vitest';
import {
  BenchPlanError, benchElapsed, benchReport, benchSummary, cellState, expandCells, parseBenchPlan,
  planPrefix, seriesCapFor, type BenchReportInput,
} from '../src/index.ts';

const base = {
  name: 'core-v1',
  models: ['typesafe/jev-1.14', 'liquid/d1-ultra'],
  arms: ['clean', 'hinted'],
  size: { preset: 'standard' },
  ladder: { mode: 'adaptive' },
  ladder_version: 2,
  series_cap_usd: 0.5,
  run_cap_usd: 2,
};

const plan = () => parseBenchPlan(base);
const field = (over: Record<string, unknown>) => {
  try { parseBenchPlan({ ...base, ...over }); } catch (e) { return (e as BenchPlanError).field; }
  throw new Error('expected a BenchPlanError');
};

describe('parseBenchPlan', () => {
  it('fills defaults and keeps booleans', () => {
    const p = plan();
    expect(p.repeat).toBe(1);
    expect(p.concurrency).toBe(2);
    expect(p.judge_depth).toBe(14);
    expect(p.max_hours).toBe(8);
    expect(p.cell_timeout_min).toBe(90);
    expect(p.artifacts).toEqual({ sql: true });
    expect(p.seed).toBeUndefined();
    expect(parseBenchPlan({ ...base, artifacts: { sql: false }, repeat: 3, seed: 42 })).toMatchObject({ repeat: 3, seed: 42, artifacts: { sql: false } });
  });

  it('rejects every malformed field with its name', () => {
    expect(field({ name: 'Bad Name' })).toBe('name');
    expect(field({ models: [] })).toBe('models');
    expect(field({ models: ['a', 'a'] })).toBe('models');
    expect(field({ models: ['a', ''] })).toBe('models[1]');
    expect(field({ arms: ['clean', 'bold'] })).toBe('arms[1]');
    expect(field({ size: { preset: 'huge' } })).toBe('size.preset');
    expect(field({ size: { preset: 'custom', games: 0 } })).toBe('size.games');
    expect(field({ size: { preset: 'completion', max_games: -1 } })).toBe('size.max_games');
    expect(field({ ladder: { mode: 'fixed' } })).toBe('ladder.level');
    expect(field({ ladder: { mode: 'random' } })).toBe('ladder.mode');
    expect(field({ ladder_version: -1 })).toBe('ladder_version');
    expect(field({ series_cap_usd: 0 })).toBe('series_cap_usd');
    expect(field({ run_cap_usd: 0.1 })).toBe('run_cap_usd');
    expect(field({ repeat: 6 })).toBe('repeat');
    expect(field({ concurrency: 3 })).toBe('concurrency');
    expect(field({ judge_depth: 21 })).toBe('judge_depth');
    expect(field({ max_hours: 0.1 })).toBe('max_hours');
    expect(field({ cell_timeout_min: 1 })).toBe('cell_timeout_min');
    expect(field({ artifacts: { sql: 'yes' } })).toBe('artifacts.sql');
    expect(field({ seed: -1 })).toBe('seed');
    expect(field({ typo: 1 })).toBe('typo');
  });

  it('accepts the image arm now that T12 is merged', () => {
    expect(parseBenchPlan({ ...base, arms: ['image'] }).arms).toEqual(['image']);
  });
});

describe('cells and caps', () => {
  it('expands models × arms × repeat in plan order with unique names', () => {
    const p = parseBenchPlan({ ...base, repeat: 2 });
    const cells = expandCells(p, planPrefix(p));
    expect(cells).toHaveLength(8);
    expect(cells.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(cells[0]!.seriesName).toBe('core-v1/typesafe/jev-1.14#clean/r1');
    expect(cells[1]!.seriesName).toBe('core-v1/typesafe/jev-1.14#clean/r2');
    expect(cells[2]!.seriesName).toBe('core-v1/typesafe/jev-1.14#hinted/r1');
    expect(cells[4]!.seriesName).toBe('core-v1/liquid/d1-ultra#clean/r1');
    expect(new Set(cells.map((c) => c.seriesName)).size).toBe(8);
    const once = expandCells(p, planPrefix(p, '20261030-1412'));
    expect(once[0]!.seriesName).toBe('core-v1@20261030-1412/typesafe/jev-1.14#clean/r1');
  });

  it('caps a cell at what is left of the run cap', () => {
    const p = plan();
    expect(seriesCapFor(p, 0)).toBe(0.5);
    expect(seriesCapFor(p, 1.75)).toBeCloseTo(0.25, 12);
    expect(seriesCapFor(p, 2.1)).toBe(0);
  });

  it('maps every series status to a cell state', () => {
    expect(cellState({ status: 'finished', status_reason: null })).toBe('finished');
    expect(cellState({ status: 'stopped_budget', status_reason: 'cap' })).toBe('budget');
    expect(cellState({ status: 'stopped_error', status_reason: 'x' })).toBe('failed');
    expect(cellState({ status: 'aborted', status_reason: null })).toBe('failed');
    expect(cellState({ status: 'running', status_reason: null }, 3)).toBe('running');
    expect(cellState({ status: 'created', status_reason: null })).toBe('pending');
    expect(cellState({ status: 'paused', status_reason: null })).toBe('pending');
  });
});

const cell = (over: Partial<BenchReportInput['cells'][number]> = {}): BenchReportInput['cells'][number] => ({
  cell: { index: 0, model: 'liquid/d1-ultra', arm: 'hinted', repeat: 1, seriesName: 'core-v1/liquid/d1-ultra#hinted' },
  seriesId: '01M64EK96XRMJWEAQXA97CFXYY', state: 'finished', status: 'finished', statusReason: null,
  games: 50, target: 50, costUsd: 0.0091,
  elo: { mean: 908, lo: 796, hi: 1020, games: 50 }, w: 23, d: 4, l: 23,
  acpl: 141.2, acceptableRate: 0.831, blunderRate: 0.118,
  blocks: [{ levelId: 'uci1320', levelElo: 1320, games: 20, score: 0.45 }, { levelId: 'eps50', levelElo: 614, games: 30, score: 0.8 }],
  abortedGames: 0, startedAt: '2026-10-30T14:12:00Z', finishedAt: '2026-10-30T16:41:00Z', ...over,
});

const reportInput = (over: Partial<BenchReportInput> = {}): BenchReportInput => ({
  runId: 'core-v1-20261030-1412', plan: plan(), planPath: 'bench/plans/core-v1.json',
  planSha256: '4f2a'.padEnd(64, '0'), prefix: 'core-v1/',
  env: { node: '26.7.0', stockfish: '19', gitSha: '1a2b3c4d5e', host: 'bench-box', mock: false },
  ladder: { version: 2, calibrated: true, file: 'data/ladder/ladder-v2.json' },
  startedAt: '2026-10-30T14:12:00Z', finishedAt: '2026-10-30T16:41:00Z', stopReason: 'completed',
  cells: [
    cell(),
    cell({
      cell: { index: 1, model: 'typesafe/jev-1.14', arm: 'hinted', repeat: 1, seriesName: 'core-v1/typesafe/jev-1.14#hinted' },
      seriesId: '01M64BJR3QV9KBBT2NQY2ETB0M', costUsd: 0.021, elo: { mean: 775, lo: 618, hi: 935, games: 50 },
      w: 11, d: 3, l: 36, acpl: 154.3, acceptableRate: 0.792, blunderRate: 0.151,
      blocks: [{ levelId: 'uci1320', levelElo: 1320, games: 25, score: 0.3 }, { levelId: 'eps50', levelElo: 614, games: 25, score: 0.72 }],
    }),
    cell({
      cell: { index: 2, model: 'typesafe/jev-1.14', arm: 'clean', repeat: 1, seriesName: 'core-v1/typesafe/jev-1.14#clean' },
      state: 'budget', status: 'stopped_budget', statusReason: 'budget: spent 0.49 + est 0.02 > cap 0.50',
      seriesId: '01M625J2GZ003DBZWK012ERQQ8', games: 41, costUsd: 0.49, w: 8, d: 2, l: 31,
      acpl: 231.5, acceptableRate: 0.762, blunderRate: 0.196, abortedGames: 2,
      blocks: [{ levelId: 'uci1320', levelElo: 1320, games: 41, score: 0.22 }],
    }),
  ],
  pairs: [
    { a: 'D1U hinted', b: 'Jev hinted', pAGtB: 0.94, diffMean: 133, diffLo: 12, diffHi: 260 },
    { a: 'Jev hinted', b: 'Jev clean', pAGtB: 0.52, diffMean: 9, diffLo: -240, diffHi: 258 },
  ],
  ...over,
});

describe('benchReport', () => {
  it('writes a deterministic report (snapshot)', () => {
    const text = benchReport(reportInput());
    expect(text).toMatchSnapshot();
    expect(benchReport(reportInput())).toBe(text);
  });

  it('never shows a bare Elo and marks overlapping pairs', () => {
    const text = benchReport(reportInput());
    expect(text).toContain('**908 ± 112** (796–1020)');
    expect(text).toContain('≈ not separable');
    expect(text).toContain('**separated**');
    expect(text).toContain('| uci1320 | eps50 |');
    expect(text).toContain('## Not finished');
    expect(text).toContain('stopped_budget at 41/50 games');
    expect(text).toContain('**Spend $0.5201 of $2.0000**');
  });

  it('flags a mock run and an uncalibrated ruler', () => {
    const text = benchReport(reportInput({
      env: { node: '26.7.0', stockfish: '19', gitSha: null, host: 'h', mock: true },
      ladder: { version: 0, calibrated: false, file: null },
    }));
    expect(text).toContain('**MOCK RUN — do not compare**');
    expect(text).toContain('**uncalibrated ruler — do not compare**');
    expect(text).toContain('git unknown');
  });

  it('formats elapsed time', () => {
    expect(benchElapsed('2026-10-30T14:12:00Z', '2026-10-30T16:41:00Z')).toBe('2 h 29 min');
    expect(benchElapsed('2026-10-30T14:12:00Z', null)).toBe('0 h 00 min');
  });
});

describe('benchSummary', () => {
  it('has a stable key order and keeps null Elo for unfinished cells', () => {
    const s = benchSummary(reportInput({ cells: [cell(), cell({ state: 'pending', elo: null, games: 0, costUsd: 0 })] }));
    expect(Object.keys(s)).toEqual(['run', 'environment', 'ladder', 'caps', 'totals', 'cells', 'pairs', 'leaderboard']);
    expect(s.totals).toEqual({ cells: 2, finished: 1, games: 50, aborted: 0, cost_usd: 0.0091 });
    expect(JSON.parse(JSON.stringify(s)).cells[1].elo).toBeNull();
    expect(s.leaderboard).toEqual([]);
  });
});
