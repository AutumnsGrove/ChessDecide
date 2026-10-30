/**
 * Series control plane: schedules games against the ladder, persists state and publishes live Elo.
 * Spec: docs/build/tasks/T06. Scheduling maths is in `@chessdecide/core` (`nextAction`).
 */
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  ARM_PRESETS, MAX_PARALLEL, currentEstimate, nextAction, playToEnd, randomOpening, sideToMove, subSeed,
  type Arm, type Color, type EloPoint, type Game, type GameConfig, type GameEvent, type JudgePort,
  type LadderFile, type LadderLevel, type Opening, type PlayerDesc, type Series, type SeriesConfig,
  type SeriesEvent, type SeriesGameRec, type SeriesSize, type SeriesStatus,
} from '@chessdecide/core';
import type { SeriesPlane } from '@chessdecide/api';
import type { EventHub } from '@chessdecide/api';
import type { Opponent } from '@chessdecide/engine';
import {
  buildSeries, loadGame, loadSeriesRow, saveGame, saveSeries, seriesGames, setGameSeriesFields,
  type Db, type SeriesRow,
} from '@chessdecide/db';
import * as schema from '@chessdecide/db/schema';
import { buildPorts, newGame, type Runtime } from './runtime.ts';

export interface SeriesDeps {
  rt: Runtime;
  db: Db;
  hub: EventHub<SeriesEvent>;
  gameHub: EventHub<GameEvent>;
  mock: boolean;
  ladder: () => LadderFile;
  judge?: JudgePort;                                                     // tests
  makeOpponentFor?: (level: LadderLevel, rng: () => number) => Promise<Opponent>;  // tests
}

const TERMINAL: readonly SeriesStatus[] = ['finished', 'aborted', 'stopped_error'];
const isTerminal = (s: string) => (TERMINAL as readonly string[]).includes(s);

const now = () => new Date().toISOString();
const parseHistory = (json: string | null): EloPoint[] => (json ? (JSON.parse(json) as EloPoint[]) : []);

/** On daemon start-up: running series and their games become paused (reason `server_restart`). */
export async function recoverSeries(db: Db): Promise<number> {
  const rows = await db.update(schema.series).set({ status: 'paused', status_reason: 'server_restart' })
    .where(eq(schema.series.status, 'running')).returning({ id: schema.series.id });
  await db.update(schema.games).set({ status: 'paused', status_reason: 'server_restart' })
    .where(eq(schema.games.status, 'running'));
  return rows.length;
}

export class SeriesControlPlane implements SeriesPlane {
  private loops = new Map<string, Promise<void>>();
  private tasks = new Map<string, Map<string, Promise<void>>>();
  private aborts = new Map<string, Map<string, AbortController>>();
  private pauseFlags = new Set<string>();
  private stopFlags = new Set<string>();
  private lastBlock = new Map<string, number>();
  private openingCache = new Map<string, Map<number, Opening>>();
  private resumeNeeded = new Set<string>();
  private locks = new Map<string, Promise<unknown>>();

  constructor(private deps: SeriesDeps) {}

  async create(cfg: SeriesConfig): Promise<Series> {
    const armId = typeof cfg.arm === 'string' ? cfg.arm : 'custom';
    const armJson = JSON.stringify(typeof cfg.arm === 'string' ? ARM_PRESETS[cfg.arm] : cfg.arm);
    const size = cfg.size;
    if (!size || typeof size !== 'object' || typeof size.preset !== 'string') throw new Error('invalid size');
    if (size.preset === 'custom' && (!Number.isInteger(size.games) || size.games < 1 || size.games > 400)) throw new Error('invalid custom size');
    const fixedLevel = cfg.ladder.mode === 'fixed' ? cfg.ladder.level : null;
    if (fixedLevel !== null && !this.deps.ladder().levels.some((l) => l.id === fixedLevel)) throw new Error('unknown ladder level');
    const id = ulid();
    const seed = cfg.seed ?? Date.now() % 2_000_000_000;
    const ladder = this.deps.ladder();
    const row: SeriesRow = {
      id, name: cfg.name ?? null, model_slug: cfg.model, arm_id: armId, arm_json: armJson,
      status: 'created', status_reason: null, size_json: JSON.stringify(size),
      ladder_mode: cfg.ladder.mode, ladder_level: fixedLevel,
      ladder_version: ladder.version, seed, budget_usd: cfg.budget_usd,
      concurrency: Math.max(1, Math.min(2, cfg.concurrency ?? 2)), judge_depth: cfg.judge_depth ?? 14,
      cost_usd: 0, elo_mean: null, elo_lo: null, elo_hi: null, w: 0, d: 0, l: 0,
      elo_history_json: null, blocks_json: null, catalog_snapshot_json: null,
      created_at: now(), finished_at: null,
    };
    await saveSeries(this.deps.db, row);
    return (await buildSeries(this.deps.db, id))!;
  }

  async start(id: string): Promise<void> {
    const row = await loadSeriesRow(this.deps.db, id);
    if (!row) throw new Error('series not found');
    if (isTerminal(row.status) || this.loops.has(id)) return;
    this.pauseFlags.delete(id);
    this.stopFlags.delete(id);
    if (row.status === 'paused' || row.status === 'running' || row.status === 'stopped_budget') this.resumeNeeded.add(id);
    await this.setStatus(id, 'running');
    const loop = this.runLoop(id)
      .catch(async (e) => {
        const message = e instanceof Error ? e.message : String(e);
        this.deps.hub.emit(id, { event: 'error', data: { code: 'series_failed', message } });
        await this.setStatus(id, 'stopped_error', message);
      })
      .finally(() => { this.loops.delete(id); });
    this.loops.set(id, loop);
  }

  async pause(id: string): Promise<void> {
    const row = await loadSeriesRow(this.deps.db, id);
    if (!row || isTerminal(row.status)) return;
    this.pauseFlags.add(id);
    const loop = this.loops.get(id);
    if (loop) await loop;
    else await this.setStatus(id, 'paused', 'paused');
  }

  async stop(id: string): Promise<void> {
    const row = await loadSeriesRow(this.deps.db, id);
    if (!row || isTerminal(row.status)) return;
    this.stopFlags.add(id);
    for (const ac of this.aborts.get(id)?.values() ?? []) ac.abort();
    await this.setStatus(id, 'aborted', 'stopped');
    await this.loops.get(id);
    // A game may have been launched while stop was in flight; abort and drain it too.
    for (const ac of this.aborts.get(id)?.values() ?? []) ac.abort();
    await Promise.all([...(this.tasks.get(id)?.values() ?? [])]);
  }

  async idle(id: string): Promise<void> {
    await this.loops.get(id);
  }

  /**
   * Series-row updates are load-modify-write. Two games can end at the same moment (and a status change
   * can land between them), so each update waits for the previous one or it would overwrite the other's
   * cost, Elo history or status.
   */
  private locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(id, tail);
    void tail.then(() => { if (this.locks.get(id) === tail) this.locks.delete(id); });
    return run;
  }

  private setStatus(id: string, status: SeriesStatus, reason?: string): Promise<void> {
    return this.locked(id, () => this.writeStatus(id, status, reason));
  }

  private async writeStatus(id: string, status: SeriesStatus, reason?: string): Promise<void> {
    const row = await loadSeriesRow(this.deps.db, id);
    if (!row) return;
    await saveSeries(this.deps.db, { ...row, status, status_reason: reason ?? null });
    this.deps.hub.emit(id, { event: 'status', data: { status, ...(reason ? { status_reason: reason } : {}) } });
  }

  private async runLoop(id: string): Promise<void> {
    for (;;) {
      const row = await loadSeriesRow(this.deps.db, id);
      if (!row) return;
      if (this.stopFlags.has(id)) { await this.setStatus(id, 'aborted', 'stopped'); return; }
      if (this.pauseFlags.has(id)) { await this.setStatus(id, 'paused', 'paused'); return; }
      if (isTerminal(row.status)) return;

      if (this.resumeNeeded.has(id)) {
        await this.resumePausedGames(id);
        this.resumeNeeded.delete(id);
      }

      const recs = await seriesGames(this.deps.db, id);
      if (!this.lastBlock.has(id)) this.lastBlock.set(id, recs.reduce((m, r) => Math.max(m, r.block), -1));
      const levels = this.deps.ladder().levels;
      const size = JSON.parse(row.size_json) as SeriesSize;
      const next = nextAction({
        size, levels, seed: row.seed ?? 0, games: recs,
        ...(row.ladder_mode === 'fixed' && row.ladder_level ? { fixedLevelId: row.ladder_level } : {}),
      });
      if (next.action === 'stop') { await this.finish(id, next.reason); return; }

      const tasks = this.tasks.get(id) ?? new Map<string, Promise<void>>();
      this.tasks.set(id, tasks);
      const concurrency = Math.max(1, Math.min(MAX_PARALLEL, row.concurrency ?? 2));
      if (next.action === 'wait' || tasks.size >= concurrency) { await this.waitOne(tasks); continue; }

      if ((row.cost_usd ?? 0) >= (row.budget_usd ?? 1)) { await this.setStatus(id, 'stopped_budget', 'budget'); return; }
      await this.launch(id, row, next);
    }
  }

  private async waitOne(tasks: Map<string, Promise<void>>): Promise<void> {
    if (tasks.size === 0) { await new Promise((r) => setTimeout(r, 10)); return; }
    await Promise.race([...tasks.values()]);
  }

  /** After a pause/restart/budget stop: continue open games from their last ply. */
  private async resumePausedGames(id: string): Promise<void> {
    const tasks = this.tasks.get(id) ?? new Map<string, Promise<void>>();
    this.tasks.set(id, tasks);
    const row = await loadSeriesRow(this.deps.db, id);
    const rows = await this.deps.db.select({ id: schema.games.id }).from(schema.games)
      .where(eq(schema.games.series_id, id));
    for (const { id: gameId } of rows) {
      if (tasks.has(gameId)) continue;
      const loaded = await loadGame(this.deps.db, gameId);
      if (!loaded || (loaded.status !== 'paused' && loaded.status !== 'stopped_budget')) continue;
      const remaining = Math.max(0.001, (row?.budget_usd ?? 1) - (row?.cost_usd ?? 0));
      const game: Game = { ...loaded, config: { ...loaded.config, budget_usd: loaded.cost_usd + remaining } };
      this.track(id, game, (signal) => this.runGame(id, game, signal));
    }
  }

  private async launch(id: string, row: SeriesRow, next: Extract<ReturnType<typeof nextAction>, { action: 'start' }>): Promise<void> {
    if (this.stopFlags.has(id)) return;
    const depth = row.judge_depth ?? 14;
    const opening = await this.openingFor(id, next.openingIndex, next.openingSeed, depth);
    if (this.stopFlags.has(id)) return;
    if (this.lastBlock.get(id) !== next.block) {
      this.lastBlock.set(id, next.block);
      this.deps.hub.emit(id, { event: 'block', data: { index: next.block, level_id: next.level.id, level_elo: next.level.elo } });
    }

    const arm: Arm | string = ARM_PRESETS[row.arm_id as keyof typeof ARM_PRESETS] ?? (JSON.parse(row.arm_json) as Arm);
    const model: PlayerDesc = { type: 'model', model: row.model_slug, arm };
    const opponent: PlayerDesc = { type: 'ladder', level: next.level.id };
    const remaining = Math.max(0.001, (row.budget_usd ?? 1) - (row.cost_usd ?? 0));
    const config: GameConfig = {
      white: next.modelColor === 'white' ? model : opponent,
      black: next.modelColor === 'black' ? model : opponent,
      opening: { type: 'fen', fen: opening.fen },
      pace_ms: 0, budget_usd: remaining, judge_depth: depth, max_plies: 200, adjudicate: true,
      seed: subSeed(row.seed ?? 0, next.index),
    };
    const base = newGame(config, opening.fen);
    const game: Game = {
      ...base, series_id: id, series_index: next.index, level_id: next.level.id, level_elo: next.level.elo,
      model_color: next.modelColor,
    };
    await saveGame(this.deps.db, game);
    await setGameSeriesFields(this.deps.db, game.id, { block_index: next.block, opening_seed: opening.seed });
    if (this.stopFlags.has(id)) {
      await saveGame(this.deps.db, { ...game, status: 'aborted', status_reason: 'stopped', termination: 'aborted' });
      return;
    }
    this.deps.hub.emit(id, {
      event: 'game_started',
      data: { game_id: game.id, index: next.index, block: next.block, level_id: next.level.id, model_color: next.modelColor },
    });
    this.track(id, game, (signal) => this.runGame(id, game, signal));
  }

  private track(id: string, game: Game, run: (signal: AbortSignal) => Promise<void>): void {
    const tasks = this.tasks.get(id) ?? new Map<string, Promise<void>>();
    this.tasks.set(id, tasks);
    const ac = new AbortController();
    const aborts = this.aborts.get(id) ?? new Map<string, AbortController>();
    this.aborts.set(id, aborts);
    aborts.set(game.id, ac);
    const p = run(ac.signal)
      .catch(async (e) => {
        const message = e instanceof Error ? e.message : String(e);
        this.deps.hub.emit(id, { event: 'error', data: { code: 'game_failed', message, game_id: game.id } });
        await this.setStatus(id, 'stopped_error', message);
      })
      .finally(() => {
        tasks.delete(game.id);
        aborts.delete(game.id);
      });
    tasks.set(game.id, p);
  }

  private async runGame(id: string, start: Game, signal: AbortSignal): Promise<void> {
    let game = start;
    let retries = 0;
    for (;;) {
      const ports = await buildPorts(this.deps.rt, this.deps.db, game, {
        mock: this.deps.mock, events: this.deps.gameHub,
        ...(this.deps.judge ? { judge: this.deps.judge } : {}),
        ...(this.deps.makeOpponentFor ? { makeOpponentFor: this.deps.makeOpponentFor } : {}),
      });
      try {
        game = await playToEnd(game, ports, { signal, shouldPause: () => this.pauseFlags.has(id), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
      } finally {
        await ports.closePlayers();
      }
      if (game.status === 'finished' || game.status === 'aborted' || game.status === 'stopped_budget') break;
      if (game.status === 'paused' && !this.pauseFlags.has(id) && String(game.status_reason ?? '').startsWith('error:')) {
        retries++;
        if (retries >= 3) {
          game = { ...game, status: 'aborted', status_reason: 'transport', termination: 'aborted' };
          await saveGame(this.deps.db, game);
          break;
        }
        continue;
      }
      break;
    }
    await this.onGameEnd(id, game);
  }

  private onGameEnd(id: string, game: Game): Promise<void> {
    return this.locked(id, () => this.recordGameEnd(id, game));
  }

  private async recordGameEnd(id: string, game: Game): Promise<void> {
    const row = await loadSeriesRow(this.deps.db, id);
    if (!row) return;
    if (game.status === 'stopped_budget') {
      await this.writeStatus(id, 'stopped_budget', 'budget');
      return;
    }
    if (game.status === 'finished') {
      const modelColor = game.model_color ?? (game.config.white.type === 'model' ? 'white' : 'black');
      const score: 0 | 0.5 | 1 = game.result === '1/2-1/2' ? 0.5
        : (game.result === '1-0') === (modelColor === 'white') ? 1 : 0;
      await setGameSeriesFields(this.deps.db, game.id, { model_score: score });
      const recs = await seriesGames(this.deps.db, id);
      const est = currentEstimate(recs);
      const history = parseHistory(row.elo_history_json);
      const point: EloPoint = { games: est.games, mean: est.mean, lo: est.lo, hi: est.hi };
      history.push(point);
      const cost = (row.cost_usd ?? 0) + game.cost_usd;
      await saveSeries(this.deps.db, {
        ...row, cost_usd: cost,
        elo_mean: est.mean, elo_lo: est.lo, elo_hi: est.hi, w: est.w, d: est.d, l: est.l,
        elo_history_json: JSON.stringify(history),
      });
      const built = await buildSeries(this.deps.db, id);
      const summary = built?.games.find((g) => g.game_id === game.id);
      if (summary) this.deps.hub.emit(id, { event: 'game_finished', data: summary });
      this.deps.hub.emit(id, { event: 'elo', data: { estimate: est, point } });
      this.deps.hub.emit(id, { event: 'spend', data: { series_usd: cost, cap_usd: row.budget_usd ?? 1 } });
      return;
    }
    if (game.status === 'aborted') {
      // An aborted game still spent whatever its model calls cost; keep the series total and cap honest.
      if (game.cost_usd > 0) await saveSeries(this.deps.db, { ...row, cost_usd: (row.cost_usd ?? 0) + game.cost_usd });
      if (this.stopFlags.has(id)) return;
      if (game.status_reason === 'transport') {
        this.deps.hub.emit(id, { event: 'error', data: { code: 'transport', message: 'game aborted after 3 retries', game_id: game.id } });
      }
      const built = await buildSeries(this.deps.db, id);
      const summary = built?.games.find((g) => g.game_id === game.id);
      if (summary) this.deps.hub.emit(id, { event: 'game_finished', data: summary });
    }
  }

  private finish(id: string, reason: 'target_reached' | 'precision_reached' | 'max_games' | 'too_many_aborts'): Promise<void> {
    return this.locked(id, () => this.writeFinish(id, reason));
  }

  private async writeFinish(id: string, reason: 'target_reached' | 'precision_reached' | 'max_games' | 'too_many_aborts'): Promise<void> {
    const row = await loadSeriesRow(this.deps.db, id);
    if (!row) return;
    const recs = await seriesGames(this.deps.db, id);
    const est = currentEstimate(recs);
    const status: SeriesStatus = reason === 'too_many_aborts' ? 'stopped_error' : 'finished';
    const finishedRow: SeriesRow = {
      ...row, status, status_reason: reason, finished_at: now(),
      elo_mean: est.mean, elo_lo: est.lo, elo_hi: est.hi, w: est.w, d: est.d, l: est.l,
    };
    await saveSeries(this.deps.db, finishedRow);
    const built = await buildSeries(this.deps.db, id);
    if (built) await saveSeries(this.deps.db, { ...finishedRow, blocks_json: JSON.stringify(built.blocks) });
    this.deps.hub.emit(id, { event: 'status', data: { status, status_reason: reason } });
  }

  private async openingFor(id: string, index: number, seed: number, depth: number): Promise<Opening> {
    const cache = this.openingCache.get(id) ?? new Map<number, Opening>();
    this.openingCache.set(id, cache);
    const hit = cache.get(index);
    if (hit) return hit;
    const judge = this.deps.judge ?? this.deps.rt.judge;
    const opening = await randomOpening(seed, async (fen) => {
      const e = await judge.evalPosition(fen, depth);
      return sideToMove(fen) === 'white' ? e.cp_stm : -e.cp_stm;
    });
    cache.set(index, opening);
    return opening;
  }
}
