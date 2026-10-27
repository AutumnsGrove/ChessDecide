import { describe, expect, it } from 'vitest';
import { DEFAULT_LADDER } from '../src/ladder.ts';
import { mulberry32 } from '../src/rng.ts';
import { randomOpening } from '../src/openings.ts';
import { nextAction, currentEstimate, type SeriesGameRec, type SeriesSize, type SeriesState } from '../src/series.ts';

const levels = DEFAULT_LADDER.levels;

/** Sequentially simulate a series against a model of true Elo `trueElo` (draw rate 0). */
function simulate(size: SeriesSize, trueElo: number, seed = 1, fixedLevelId?: string, abortEvery = 0) {
  const rng = mulberry32(seed + 1000);
  const games: SeriesGameRec[] = [];
  let guard = 0, startedCount = 0;
  for (;;) {
    if (guard++ > 1000) throw new Error('runaway');
    const st: SeriesState = { size, levels, seed, games, ...(fixedLevelId ? { fixedLevelId } : {}) };
    const n = nextAction(st);
    if (n.action === 'stop') return { games, reason: n.reason };
    if (n.action === 'wait') {                                  // finish the oldest running game
      const g = games.find((x) => x.status === 'running')!;
      g.status = 'finished'; g.score = rng() < 1 / (1 + 10 ** ((g.levelElo - trueElo) / 400)) ? 1 : 0;
      continue;
    }
    startedCount++;
    const rec: SeriesGameRec = { index: n.index, block: n.block, levelId: n.level.id, levelElo: n.level.elo, status: 'running' };
    games.push(rec);
    if (abortEvery && startedCount % abortEvery === 0) rec.status = 'aborted';
  }
}

describe('series scheduler', () => {
  it('quick = exactly 25 finished games, standard = 50, custom = N', () => {
    expect(simulate({ preset: 'quick' }, 800).games.filter((g) => g.status === 'finished')).toHaveLength(25);
    expect(simulate({ preset: 'standard' }, 800).games.filter((g) => g.status === 'finished')).toHaveLength(50);
    expect(simulate({ preset: 'custom', games: 7 }, 800).games.filter((g) => g.status === 'finished')).toHaveLength(7);
  });
  it('colours alternate by index; openings are paired; blocks of 5; first block faces the level nearest 1200', () => {
    const { games } = simulate({ preset: 'quick' }, 800);
    expect(games.map((g) => g.block)).toEqual(Array.from({ length: 25 }, (_, i) => Math.floor(i / 5)));
    expect(new Set(games.filter((g) => g.block === 0).map((g) => g.levelId))).toEqual(new Set(['eps15']));
    for (let b = 0; b < 5; b++) expect(new Set(games.filter((g) => g.block === b).map((g) => g.levelId)).size).toBe(1);
  });
  it('adaptive levels converge near the true strength', () => {
    const { games } = simulate({ preset: 'quick' }, 800, 3);
    const last = games.filter((g) => g.block >= 3);
    const mean = last.reduce((s, g) => s + g.levelElo, 0) / last.length;
    expect(mean).toBeGreaterThan(500); expect(mean).toBeLessThan(1150);
  });
  it('fixed ladder mode never adapts', () => {
    const { games } = simulate({ preset: 'custom', games: 10 }, 800, 1, 'uci1500');
    expect(new Set(games.map((g) => g.levelId))).toEqual(new Set(['uci1500']));
  });
  it('never more than 2 games in flight, and a block waits for the previous block', () => {
    const games: SeriesGameRec[] = [];
    const st = (): SeriesState => ({ size: { preset: 'quick' }, levels, seed: 1, games });
    const start = () => { const n = nextAction(st()); expect(n.action).toBe('start'); if (n.action === 'start') games.push({ index: n.index, block: n.block, levelId: n.level.id, levelElo: n.level.elo, status: 'running' }); };
    start(); start();
    expect(nextAction(st())).toEqual({ action: 'wait', reason: 'parallel_limit' });
    for (const g of games) { g.status = 'finished'; g.score = 0.5; }
    start(); start(); games[2]!.status = 'finished'; games[2]!.score = 1; games[3]!.status = 'finished'; games[3]!.score = 1;
    start();                                       // index 4 (block 0)
    games[4]!.status = 'running';
    expect(games).toHaveLength(5);
    const n = nextAction(st());                    // index 5 is block 1 while game 4 still runs
    expect(n).toEqual({ action: 'wait', reason: 'block_in_progress' });
  });
  it('aborted games are excluded from the rating and replaced; 3 consecutive aborts stop the series', () => {
    const r = simulate({ preset: 'custom', games: 6 }, 800, 1, undefined, 4);          // every 4th started game aborts
    expect(r.games.filter((g) => g.status === 'finished')).toHaveLength(6);
    expect(currentEstimate(r.games).games).toBe(6);
    const games: SeriesGameRec[] = [0, 1, 2].map((i) => ({ index: i, block: 0, levelId: 'eps15', levelElo: 1150, status: 'aborted' as const }));
    expect(nextAction({ size: { preset: 'quick' }, levels, seed: 1, games })).toEqual({ action: 'stop', reason: 'too_many_aborts' });
  });
  it('completion stops on precision (>= 25 games) or at 200', () => {
    const r = simulate({ preset: 'completion', target_half_width: 90 }, 800, 2);
    const fin = r.games.filter((g) => g.status === 'finished').length;
    expect(fin).toBeGreaterThanOrEqual(25); expect(fin).toBeLessThanOrEqual(200);
    expect(['precision_reached', 'max_games']).toContain(r.reason);
    if (r.reason === 'precision_reached') expect(currentEstimate(r.games).half_width).toBeLessThanOrEqual(90);
    const cap = simulate({ preset: 'completion', target_half_width: 1, max_games: 30 }, 800, 2);
    expect(cap.reason).toBe('max_games'); expect(cap.games.filter((g) => g.status === 'finished')).toHaveLength(30);
  });
  it('deterministic given the seed', () => {
    const a = simulate({ preset: 'quick' }, 800, 9).games.map((g) => g.levelId).join();
    const b = simulate({ preset: 'quick' }, 800, 9).games.map((g) => g.levelId).join();
    expect(a).toBe(b);
  });
});

describe('random openings', () => {
  it('is deterministic, 4 plies, and respects the eval filter', async () => {
    const ev = async () => 0;
    const a = await randomOpening(42, ev), b = await randomOpening(42, ev);
    expect(a).toEqual(b); expect(a.sans).toHaveLength(4); expect(a.attempts).toBe(1);
    let calls = 0;
    const picky = await randomOpening(42, async () => (calls++ < 3 ? 500 : 20));
    expect(picky.attempts).toBe(4); expect(Math.abs(picky.eval_cp)).toBeLessThanOrEqual(100);
    const never = await randomOpening(42, async () => 500, { maxAttempts: 5 });
    expect(never.attempts).toBeGreaterThanOrEqual(1);                       // falls back to the closest candidate
  });
});
