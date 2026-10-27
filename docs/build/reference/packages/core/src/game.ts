/** stepGame: plays exactly one ply. Pure apart from the injected ports. */
import { applyMove, legalMoves, outcomeOf, positionKey, sideToMove } from './chess.ts';
import { adjudicate } from './adjudication.ts';
import {
  annotateOptions, evalAfterFromOracle, evalFromSideToMove, evalTerminal, judgePlayed,
} from './oracle.ts';
import type { Oracle } from './oracle.ts';
import type { Ports } from './ports.ts';
import type { Color, Game, Ply, PositionEval, Result, Termination } from './types.ts';

export const isTerminal = (g: Game) => g.status === 'finished' || g.status === 'aborted';

export function lastFen(g: Game): string {
  return g.plies.length ? g.plies[g.plies.length - 1]!.fen_after : g.start_fen;
}
/** positionKey of every position strictly before the current one (start included). */
export function previousKeys(g: Game): string[] {
  const fens = [g.start_fen, ...g.plies.map((p) => p.fen_after)];
  return fens.slice(0, -1).map(positionKey);
}
export function historySan(g: Game): string[] { return g.plies.map((p) => p.san); }

function resultFor(winner: Color | null): Result {
  return winner === 'white' ? '1-0' : winner === 'black' ? '0-1' : '1/2-1/2';
}

export async function stepGame(game: Game, ports: Ports, signal?: AbortSignal): Promise<Game> {
  if (isTerminal(game)) return game;
  const fenBefore = lastFen(game);
  const side = sideToMove(fenBefore);
  const plyNo = game.plies.length + 1;
  const legal = legalMoves(fenBefore);
  if (legal.length === 0) throw new Error('stepGame called on a position with no legal moves');

  const desc = side === 'white' ? game.config.white : game.config.black;
  const by: 'model' | 'engine' = desc.type === 'model' ? 'model' : 'engine';
  const forced = by === 'model' && legal.length === 1;

  // --- obtain the move ---
  let uci: string;
  let decision: Ply['decision'] = null;
  let engineInfo: Ply['engine_info'] = null;
  let probs: Record<string, number> | undefined;
  let spent = 0;
  if (forced) {
    uci = legal[0]!.uci;                                  // no model call, no cost
  } else {
    if (by === 'model') {
      const b = ports.budget.check(game);
      if (!b.ok) return setStatus(game, ports, 'stopped_budget', b.reason ?? 'budget');
    }
    ports.events.emit(game.id, { event: 'thinking', data: { ply: plyNo, side, by, started_at: ports.now() } });
    try {
      const pm = await ports.player(side, game).move(
        { game, fen: fenBefore, historySan: historySan(game), legal, ply: plyNo, side }, signal);
      uci = pm.uci; decision = pm.decision ?? null; engineInfo = pm.engine_info ?? null;
      probs = pm.probs; spent = pm.cost_usd ?? 0;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      ports.events.emit(game.id, { event: 'error', data: { code: 'move_failed', message, ply: plyNo } });
      return setStatus(game, ports, 'paused', `error: ${message}`);
    }
  }
  if (!legal.some((m) => m.uci === uci)) {
    const message = `player returned illegal move ${uci}`;
    ports.events.emit(game.id, { event: 'error', data: { code: 'illegal_move', message, ply: plyNo } });
    return setStatus(game, ports, 'paused', `error: ${message}`);
  }

  // --- apply and persist the ply ---
  const { fen: fenAfter, move } = applyMove(fenBefore, uci);
  let ply: Ply = {
    ply: plyNo, side, by, uci, san: move.san, fen_after: fenAfter,
    ...(forced ? { forced: true } : {}),
    decision, engine_info: engineInfo, eval: null, judge: null, created_at: ports.now(),
  };
  await ports.store.savePly(game.id, ply);
  ports.events.emit(game.id, { event: 'ply', data: ply });

  // --- termination by rules (no search needed) ---
  const keysBefore = previousKeys(game).concat(positionKey(fenBefore));
  const outcome = outcomeOf(fenAfter, keysBefore);

  // --- judge: model plies get the full oracle; every ply gets a PositionEval ---
  const depth = game.config.judge_depth;
  let posEval: PositionEval;
  let oracle: Oracle | null = null;
  if (by === 'model' && !forced) {
    oracle = await ports.judge.oracle(fenBefore, depth);
    ply = { ...ply, judge: judgePlayed(oracle, uci, probs) };
    if (decision) {
      const san = (u: string) => legal.find((m) => m.uci === u)?.san ?? u;
      ply = { ...ply, decision: { ...decision, top_options: annotateOptions(decision.top_options, oracle, san) } };
    }
  }
  if (outcome === 'checkmate') posEval = evalTerminal(depth, side);
  else if (outcome === 'stalemate' || outcome === 'insufficient') posEval = evalTerminal(depth, null);
  else if (oracle) posEval = evalAfterFromOracle(oracle, uci, side === 'white');
  else {
    const s = await ports.judge.evalPosition(fenAfter, depth);
    posEval = evalFromSideToMove(depth, s.cp_stm, s.wdl_stm, sideToMove(fenAfter) === 'white');
  }
  ply = { ...ply, eval: posEval };
  await ports.store.savePly(game.id, ply);
  ports.events.emit(game.id, { event: 'judged', data: { ply: plyNo, eval: ply.eval ?? null, judge: ply.judge ?? null } });

  // --- result ---
  const plies = [...game.plies, ply];
  const evals = plies.map((p) => p.eval?.white_eval_cp ?? 0);
  let result: Result = '*', termination: Termination = '', adjudicated = false, status = game.status;
  if (outcome === 'checkmate') { result = resultFor(side); termination = 'checkmate'; }
  else if (outcome === 'stalemate') { result = '1/2-1/2'; termination = 'stalemate'; }
  else if (outcome === 'insufficient') { result = '1/2-1/2'; termination = 'insufficient'; }
  else if (outcome === 'threefold') { result = '1/2-1/2'; termination = 'repetition'; }
  else if (outcome === 'fifty_move') { result = '1/2-1/2'; termination = 'fifty_move'; }
  else if (game.config.adjudicate && adjudicate(evals)) {
    result = resultFor(adjudicate(evals)); termination = 'adjudicated'; adjudicated = true;
  } else if (plies.length >= game.config.max_plies) { result = '1/2-1/2'; termination = 'max_plies'; }
  if (result !== '*') status = 'finished';

  const next: Game = {
    ...game, plies, result, termination, adjudicated, status,
    status_reason: status === 'finished' ? termination : game.status_reason,
    cost_usd: game.cost_usd + spent,
  };
  await ports.store.saveGame(next);
  if (spent > 0) ports.events.emit(game.id, { event: 'spend', data: { game_usd: next.cost_usd } });
  if (next.status !== game.status) {
    ports.events.emit(game.id, { event: 'status', data: { status: next.status, ...(next.status_reason ? { status_reason: next.status_reason } : {}) } });
  }
  return next;
}

async function setStatus(game: Game, ports: Ports, status: Game['status'], reason: string): Promise<Game> {
  const next = { ...game, status, status_reason: reason };
  await ports.store.saveGame(next);
  ports.events.emit(game.id, { event: 'status', data: { status, status_reason: reason } });
  return next;
}

/** Runner loop helper (saves the game row first, then steps until done). */
export interface PlayOptions {
  signal?: AbortSignal;                       // abort: the game ends `aborted` (terminal)
  shouldPause?: () => boolean;                // checked between plies: the game becomes `paused`
  paceMs?: number; sleep?: (ms: number) => Promise<void>;
  onGame?: (g: Game) => void;                 // called after every step with the new state
}
export async function playToEnd(game: Game, ports: Ports, opts: PlayOptions = {}): Promise<Game> {
  let g: Game = { ...game, status: 'running' };
  await ports.store.saveGame(g);                 // the games row must exist before any plies row (foreign key)
  while (!isTerminal(g) && g.status === 'running') {
    if (opts.signal?.aborted) {
      g = { ...g, status: 'aborted', status_reason: 'stopped', termination: 'aborted' };
      await ports.store.saveGame(g); ports.events.emit(g.id, { event: 'status', data: { status: 'aborted', status_reason: 'stopped' } });
      return g;
    }
    if (opts.shouldPause?.()) {
      g = { ...g, status: 'paused', status_reason: 'paused' };
      await ports.store.saveGame(g); ports.events.emit(g.id, { event: 'status', data: { status: 'paused', status_reason: 'paused' } });
      return g;
    }
    const t = Date.now();
    g = await stepGame(g, ports, opts.signal);
    opts.onGame?.(g);
    if (opts.paceMs && opts.sleep) {
      const wait = opts.paceMs - (Date.now() - t);
      if (wait > 0 && !isTerminal(g) && g.status === 'running') await opts.sleep(wait);
    }
  }
  return g;
}
