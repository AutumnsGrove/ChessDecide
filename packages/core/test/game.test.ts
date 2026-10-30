import { describe, expect, it } from 'vitest';
import { legalMoves, sideToMove } from '../src/chess.ts';
import { mulberry32 } from '../src/rng.ts';
import { playToEnd, stepGame } from '../src/game.ts';
import type { GameEvent, JudgePort, Player, Ports } from '../src/ports.ts';
import type { Oracle } from '../src/oracle.ts';
import { START_FEN, type Color, type Game, type GameConfig, type Ply } from '../src/types.ts';

const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({
  white: { type: 'model', model: 'm', arm: 'clean' }, black: { type: 'ladder', level: 'random' },
  opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1, ...over,
});
const newGame = (over: Partial<GameConfig> = {}, fen = START_FEN): Game => ({
  id: 'g1', status: 'ready', config: cfg(over), start_fen: fen, adjudicated: false, plies: [],
  result: '*', termination: '', cost_usd: 0, created_at: '2026-01-01T00:00:00Z',
});

/** Player that plays a fixed list of UCI moves. */
const scripted = (kind: 'model' | 'engine', moves: string[], cost = 0): Player => {
  let i = 0;
  return { kind, async move() { const uci = moves[i++]!; return { uci, cost_usd: cost, ...(kind === 'model' ? { decision: null } : {}) }; } };
};
/** Judge: every move scores cp 0 except the first listed (cp 10); eval search returns 0. */
const fakeJudge = (evalCp = 0): JudgePort & { oracleCalls: number; evalCalls: number } => ({
  oracleCalls: 0, evalCalls: 0,
  async oracle(fen) {
    this.oracleCalls++;
    const rows = legalMoves(fen).map((m, i) => ({ uci: m.uci, san: m.san, cp: i === 0 ? 10 : 0, wp: i === 0 ? 51 : 50, wdl: [0, 0, 0] as [number, number, number] }));
    return { depth: 14, sf_version: 'fake', rows } satisfies Oracle;
  },
  async evalPosition() { this.evalCalls++; return { cp_stm: evalCp, wdl_stm: [300, 400, 300] }; },
});
function harness(white: Player, black: Player, judge = fakeJudge(), budgetOk = () => true) {
  const events: GameEvent[] = []; const saved: Ply[] = []; let games = 0;
  const ports: Ports = {
    player: (side: Color) => (side === 'white' ? white : black),
    judge,
    store: { async saveGame() { games++; }, async savePly(_id, p) { saved.push(p); } },
    events: { emit: (_id, e) => events.push(e) },
    budget: { check: () => (budgetOk() ? { ok: true } : { ok: false, reason: 'cap' }) },
    now: () => '2026-01-01T00:00:00Z',
  };
  return { ports, events, saved, judge, games: () => games };
}

describe('stepGame', () => {
  it("fool's mate: black wins, 4 plies, events in order, model plies get an oracle", async () => {
    const h = harness(scripted('model', ['f2f3', 'g2g4'], 0.0001), scripted('engine', ['e7e5', 'd8h4']));
    let g = newGame();
    g = await playToEnd(g, h.ports);
    expect(g.result).toBe('0-1'); expect(g.termination).toBe('checkmate'); expect(g.status).toBe('finished');
    expect(g.plies.map((p) => p.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(g.plies.every((p) => p.eval)).toBe(true);
    expect(g.plies[3]!.eval!.white_eval_cp).toBe(-1000);               // black mated white
    expect(g.plies[0]!.judge?.cpl).toBe(10);                           // f3 is not the fake best
    expect(g.plies[1]!.judge).toBeNull();                              // engine plies have no judge
    expect(h.judge.oracleCalls).toBe(2);                               // one per model ply
    expect(h.judge.evalCalls).toBe(1);                                 // e5 only; Qh4# is terminal
    expect(g.cost_usd).toBeCloseTo(0.0002, 9);
    const names = h.events.map((e) => e.event);
    expect(names.slice(0, 4)).toEqual(['thinking', 'ply', 'judged', 'spend']);
    expect(names.at(-1)).toBe('status');
  });
  it('forced move: no player call, no cost, flagged', async () => {
    const fen = '8/2Q4p/p5pk/1ppbp3/3B2P1/P2P2bP/3P4/1R5K w - - 1 33';
    let called = 0;
    const model: Player = { kind: 'model', async move() { called++; return { uci: 'x' }; } };
    const h = harness(model, scripted('engine', []));
    const g = await stepGame(newGame({}, fen), h.ports);
    expect(called).toBe(0);
    expect(g.plies[0]!.forced).toBe(true); expect(g.plies[0]!.uci).toBe('h1g1');
    expect(h.judge.oracleCalls).toBe(0);
  });
  it('budget stop happens before the model call and is resumable', async () => {
    let called = 0;
    const model: Player = { kind: 'model', async move() { called++; return { uci: 'e2e4' }; } };
    const h = harness(model, scripted('engine', []), fakeJudge(), () => false);
    const g = await stepGame(newGame(), h.ports);
    expect(called).toBe(0); expect(g.status).toBe('stopped_budget'); expect(g.plies).toHaveLength(0);
  });
  it('transport error pauses with a reason and leaves no ply', async () => {
    const bad: Player = { kind: 'model', async move() { throw new Error('upstream 502'); } };
    const h = harness(bad, scripted('engine', []));
    const g = await stepGame(newGame(), h.ports);
    expect(g.status).toBe('paused'); expect(g.status_reason).toContain('upstream 502'); expect(g.plies).toHaveLength(0);
    expect(h.events.some((e) => e.event === 'error')).toBe(true);
  });
  it('a move that fails because the signal aborted leaves the game untouched for playToEnd to abort', async () => {
    const ac = new AbortController();
    const failing: Player = { kind: 'model', async move() { ac.abort(); throw new Error('aborted'); } };
    const h = harness(failing, scripted('engine', []));
    const g = await playToEnd(newGame(), h.ports, { signal: ac.signal });
    expect(g.status).toBe('aborted'); expect(g.plies).toHaveLength(0);
    expect(h.events.some((e) => e.event === 'error')).toBe(false);
  });

  it('illegal move from a player pauses the game', async () => {
    const h = harness(scripted('model', ['e2e5']), scripted('engine', []));
    const g = await stepGame(newGame(), h.ports);
    expect(g.status).toBe('paused'); expect(g.status_reason).toContain('illegal');
  });
  it('threefold repetition is a draw', async () => {
    const w = scripted('model', ['g1f3', 'f3g1', 'g1f3', 'f3g1']), b = scripted('engine', ['g8f6', 'f6g8', 'g8f6', 'f6g8']);
    const g = await playToEnd(newGame(), harness(w, b).ports);
    expect(g.termination).toBe('repetition'); expect(g.result).toBe('1/2-1/2'); expect(g.plies).toHaveLength(8);
  });
  it('max_plies is a draw', async () => {
    const w = scripted('model', ['g1f3', 'f3g1']), b = scripted('engine', ['g8f6', 'f6g8']);
    const g = await playToEnd(newGame({ max_plies: 4 }), harness(w, b).ports);
    expect(g.termination).toBe('max_plies'); expect(g.plies).toHaveLength(4);
  });
  const randomPlayer = (kind: 'model' | 'engine', seed: number): Player => {
    const rng = mulberry32(seed);
    return { kind, async move(ctx) { return { uci: ctx.legal[Math.floor(rng() * ctx.legal.length)]!.uci, ...(kind === 'model' ? { decision: null } : {}) }; } };
  };
  it('alternating White-POV evals never adjudicate', async () => {
    // a judge that always answers cp_stm = -1000 gives +1000 after White moves and -1000 after Black moves
    const h = harness(randomPlayer('model', 5), randomPlayer('engine', 6), fakeJudge(-1000));
    const g = await playToEnd(newGame({ max_plies: 60 }), h.ports);
    expect(g.adjudicated).toBe(false);
  });
  it('adjudication triggers on a consistent White-POV eval at ply 30', async () => {
    const judge = fakeJudge(0);
    judge.oracle = async (fen) => ({ depth: 14, sf_version: 'f', rows: legalMoves(fen).map((m) => ({ uci: m.uci, san: m.san, cp: 1000, wp: 100, wdl: [1000, 0, 0] as [number, number, number] })) });
    judge.evalPosition = async (fen) => (sideToMove(fen) === 'white' ? { cp_stm: 1000, wdl_stm: [1000, 0, 0] } : { cp_stm: -1000, wdl_stm: [0, 0, 1000] });
    const g = await playToEnd(newGame({ max_plies: 400 }), harness(randomPlayer('model', 5), randomPlayer('engine', 6), judge).ports);
    expect(g.termination).toBe('adjudicated'); expect(g.adjudicated).toBe(true); expect(g.result).toBe('1-0');
    expect(g.plies).toHaveLength(30);
  });
});
