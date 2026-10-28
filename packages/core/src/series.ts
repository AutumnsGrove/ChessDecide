/** Series scheduling: pure functions. Spec: docs/METRICS.md B4. */
import { estimate, type EloEstimate, type RatedGame } from './elo.ts';
import { nearestLevel, type LadderLevel } from './ladder.ts';
import { subSeed } from './rng.ts';
import type { Color } from './types.ts';

export const BLOCK_SIZE = 5;
export const PRIOR_START_ELO = 1200;
export const MAX_PARALLEL = 2;
export const MAX_CONSECUTIVE_ABORTS = 3;

export type SeriesSize =
  | { preset: 'quick' }                                             // 25 finished games
  | { preset: 'standard' }                                          // 50
  | { preset: 'custom'; games: number }
  | { preset: 'completion'; target_half_width?: number; min_games?: number; max_games?: number };

export const sizeTarget = (s: SeriesSize): number | null =>
  s.preset === 'quick' ? 25 : s.preset === 'standard' ? 50 : s.preset === 'custom' ? s.games : null;

export interface SeriesGameRec {
  index: number;                       // 0-based, assigned in start order
  block: number;                       // floor(index / BLOCK_SIZE)
  levelId: string; levelElo: number;
  status: 'running' | 'finished' | 'aborted';
  score?: 0 | 0.5 | 1;                 // model score, set when finished
}

export interface SeriesState {
  size: SeriesSize;
  levels: readonly LadderLevel[];
  fixedLevelId?: string;               // ladder mode "fixed"
  seed: number;
  games: readonly SeriesGameRec[];
}

export type Next =
  | { action: 'start'; index: number; block: number; level: LadderLevel; modelColor: Color; openingIndex: number; openingSeed: number }
  | { action: 'wait'; reason: 'parallel_limit' | 'block_in_progress' | 'target_reached_waiting' }
  | { action: 'stop'; reason: 'target_reached' | 'precision_reached' | 'max_games' | 'too_many_aborts' };

export const modelColorFor = (index: number): Color => (index % 2 === 0 ? 'white' : 'black');
export const openingIndexFor = (index: number) => Math.floor(index / 2);
export const openingSeedFor = (seed: number, index: number) => subSeed(seed, openingIndexFor(index));

export function ratedGames(games: readonly SeriesGameRec[]): RatedGame[] {
  return games.filter((g) => g.status === 'finished' && g.score !== undefined).map((g) => ({ opponentElo: g.levelElo, score: g.score! }));
}
export function currentEstimate(games: readonly SeriesGameRec[]): EloEstimate { return estimate(ratedGames(games)); }

function trailingAborts(games: readonly SeriesGameRec[]): number {
  const done = games.filter((g) => g.status !== 'running').sort((a, b) => a.index - b.index);
  let n = 0;
  for (let i = done.length - 1; i >= 0 && done[i]!.status === 'aborted'; i--) n++;
  return n;
}

export function nextAction(s: SeriesState): Next {
  const finished = s.games.filter((g) => g.status === 'finished').length;
  const running = s.games.filter((g) => g.status === 'running').length;
  const started = s.games.length;
  if (trailingAborts(s.games) >= MAX_CONSECUTIVE_ABORTS) return { action: 'stop', reason: 'too_many_aborts' };

  const fixed = sizeTarget(s.size);
  if (fixed !== null) {
    if (finished >= fixed) return { action: 'stop', reason: 'target_reached' };
    if (finished + running >= fixed) return { action: 'wait', reason: 'target_reached_waiting' };
  } else if (s.size.preset === 'completion') {
    const min = s.size.min_games ?? 25, max = s.size.max_games ?? 200, target = s.size.target_half_width ?? 75;
    if (finished >= max) return { action: 'stop', reason: 'max_games' };
    if (finished >= min && currentEstimate(s.games).half_width <= target) return { action: 'stop', reason: 'precision_reached' };
    if (finished + running >= max) return { action: 'wait', reason: 'target_reached_waiting' };
  }
  if (running >= MAX_PARALLEL) return { action: 'wait', reason: 'parallel_limit' };

  const index = started;
  const block = Math.floor(index / BLOCK_SIZE);
  // A block starts only when every game of earlier blocks has finished or aborted.
  if (s.games.some((g) => g.block < block && g.status === 'running')) return { action: 'wait', reason: 'block_in_progress' };

  let level: LadderLevel;
  const sameBlock = s.games.find((g) => g.block === block);
  if (s.fixedLevelId) level = s.levels.find((l) => l.id === s.fixedLevelId) ?? s.levels[0]!;
  else if (sameBlock) level = s.levels.find((l) => l.id === sameBlock.levelId)!;
  else if (block === 0) level = nearestLevel(s.levels, PRIOR_START_ELO);
  else level = nearestLevel(s.levels, currentEstimate(s.games).mean);

  return { action: 'start', index, block, level, modelColor: modelColorFor(index), openingIndex: openingIndexFor(index), openingSeed: openingSeedFor(s.seed, index) };
}
