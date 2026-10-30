import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  START_FEN, evalPawns, estimate, leaderboardCsv, LEADERBOARD_CSV_HEADER, gameToPgn, pgnDate, plyComment,
  seriesCsv, SERIES_CSV_HEADER, toCsv, type Game, type Judge, type LeaderRow, type Ply, type Series, type SeriesGame,
} from '../src/index.ts';

/** Play SAN moves on a real board so the FENs and SANs are exactly what a game would store. */
function played(moves: string[], cp: number[] = [], startFen?: string): Ply[] {
  const c = startFen ? new Chess(startFen) : new Chess();
  return moves.map((san, i) => {
    const m = c.move(san);
    return {
      ply: i + 1, side: m.color === 'w' ? 'white' : 'black', by: i % 4 < 2 ? 'model' : 'engine',
      uci: m.from + m.to, san: m.san, fen_after: c.fen(), forced: false,
      decision: i % 4 < 2 ? {
        model_slug: 'liquid/d1-ultra', arm: 'hinted', pick_uci: m.from + m.to, p_pick: 0.31,
        n_options: 2, top_options: [], latency_ms: 500, usage: { input_tokens: 100, output_tokens: 10, cost_usd: 0.0002 },
        cache_hit: false, retries: 0, attempt_id: 1,
      } : null,
      engine_info: i % 4 < 2 ? null : { engine_id: 'stockfish', level_id: 'uci1500', elo: 1500, time_ms: 50, random: false },
      eval: { depth: 14, white_eval_cp: cp[i] ?? 20, wdl: [100, 800, 100] },
      judge: null, created_at: 't',
    } satisfies Ply;
  });
}

const judge = (cls: Judge['class']): Judge => ({
  depth: 14, best_uci: 'e2e4', best_san: 'e4', best_cp: 20, played_cp: 10, cpl: 10,
  win_loss: 1, class: cls, acceptable: cls === 'ok',
});

function game(over: Partial<Game> = {}): Game {
  return {
    id: 'G1', status: 'finished',
    config: {
      white: { type: 'model', model: 'liquid/d1-ultra', arm: 'hinted' },
      black: { type: 'ladder', level: 'uci1500' },
      opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 0.5, judge_depth: 14, max_plies: 200,
      adjudicate: true, seed: 1,
    },
    start_fen: START_FEN, level_id: 'uci1500', level_elo: 1583, model_color: 'white',
    adjudicated: false, plies: played(['e4', 'e5', 'Nf3', 'Nc6']), result: '1-0',
    termination: 'checkmate', cost_usd: 0.0004, created_at: '2026-10-30T09:15:00.000Z',
    ...over,
  };
}

describe('PGN', () => {
  it('replays to the same final position and ply count', () => {
    const g = game();
    const pgn = gameToPgn(g);
    const c = new Chess();
    c.loadPgn(pgn);
    expect(c.history()).toHaveLength(g.plies.length);
    expect(c.fen()).toBe(g.plies.at(-1)!.fen_after);
    expect(pgn.trimEnd().endsWith('1-0')).toBe(true);
  });

  it('writes the tags the spec asks for, in order', () => {
    const pgn = gameToPgn(game(), { site: 'chessdecide' });
    const tags = [...pgn.matchAll(/^\[(\w+) /gm)].map((m) => m[1]);
    expect(tags).toEqual(['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result', 'Termination', 'Model', 'Arm', 'Level', 'CostUSD']);
    expect(pgn).toContain('[Event "ChessDecide"]');
    expect(pgn).toContain('[Site "chessdecide"]');
    expect(pgn).toContain('[Date "2026.10.30"]');
    expect(pgn).toContain('[White "liquid/d1-ultra"]');
    expect(pgn).toContain('[Black "Ladder uci1500"]');
    expect(pgn).toContain('[Termination "checkmate"]');
    expect(pgn).toContain('[Model "liquid/d1-ultra"]');
    expect(pgn).toContain('[Arm "hinted"]');
    expect(pgn).toContain('[Level "uci1500 (1583)"]');
    expect(pgn).toContain('[CostUSD "0.000400"]');
    expect(gameToPgn(game())).toContain('[Site "local"]');
  });

  it('puts an eval comment after every judged ply, p= only for model picks', () => {
    const g = game();
    g.plies = g.plies.map((p, i) => ({ ...p, eval: { depth: 14, white_eval_cp: [-35, 23, 1000, 0][i]!, wdl: [100, 800, 100] } }));
    const pgn = gameToPgn(g);
    expect(pgn).toContain('{[%eval -0.35] p=0.31}');
    expect(pgn).toContain('{[%eval 0.23] p=0.31}');
    expect(pgn).toContain('{[%eval 10.00]}');            // clamped, engine ply: no p=
    expect(pgn).toContain('{[%eval 0.00]}');
    expect(evalPawns(-1000)).toBe('-10.00');
    expect(plyComment({ ...g.plies[0]!, eval: null })).toBeUndefined();
  });

  it('annotates judged model plies and leaves engine plies alone', () => {
    const g = game();
    g.plies = g.plies.map((p, i) => (i === 0 ? { ...p, by: 'model', judge: judge('blunder') } : i === 2 ? { ...p, by: 'model', judge: judge('inaccuracy') } : p));
    const pgn = gameToPgn(g);
    expect(pgn).toMatch(/\b1\. e4\?\?/);
    expect(pgn).toMatch(/\b2\. Nf3\?!/);
    expect(pgn).toMatch(/\be5 \{/);
    expect(pgn).not.toMatch(/e5[?!]/);
  });

  it('marks a forced move so no p= is written', () => {
    const g = game();
    g.plies = g.plies.map((p, i) => (i === 1 ? { ...p, forced: true, judge: null } : p));
    expect(gameToPgn(g)).toContain('{[%eval 0.20]}');
    expect(gameToPgn(g)).not.toMatch(/e5 \{\[%eval 0\.20\] p=/);
  });

  it('includes SetUp/FEN for a custom starting position', () => {
    const c = new Chess();
    c.move('e4'); c.move('e5');
    const fen = c.fen();
    const plies = played(['Nf3'], [], fen);
    const g = game({ start_fen: fen, plies });
    const pgn = gameToPgn(g);
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain(`[FEN "${fen}"]`);
    const replay = new Chess();
    replay.loadPgn(pgn);
    expect(replay.fen()).toBe(plies[0]!.fen_after);
    expect(replay.history()).toHaveLength(1);
    // Fullmove 2 in the FEN, so the first move is numbered 2, not 1.
    expect(pgn).toMatch(/\b2\. Nf3/);
  });

  it('numbers from the FEN when Black moves first', () => {
    const c = new Chess();
    c.move('e4');
    const fen = c.fen();
    const plies = played(['e5'], [], fen);
    const g = game({ start_fen: fen, plies, result: '*' });
    const pgn = gameToPgn(g);
    expect(pgn).toMatch(/\b1\.\.\. e5/);
    const replay = new Chess();
    replay.loadPgn(pgn);
    expect(replay.fen()).toBe(plies[0]!.fen_after);
  });

  it('wraps movetext at 80 columns', () => {
    const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O'];
    const g = game({ plies: played(moves) });
    const body = gameToPgn(g).split('\n\n')[1]!.trimEnd().split('\n');
    for (const line of body) expect(line.length).toBeLessThanOrEqual(80);
    expect(body.length).toBeGreaterThan(1);
  });

  it('formats dates without guessing', () => {
    expect(pgnDate('2026-10-30T09:15:00.000Z')).toBe('2026.10.30');
    expect(pgnDate('not a date')).toBe('????.??.??');
  });
});

// ---- CSV ----

const sg = (over: Partial<SeriesGame> = {}): SeriesGame => ({
  game_id: 'G1', index: 0, block: 0, level_id: 'uci1500', level_elo: 1583, model_color: 'white',
  status: 'finished', result: '1-0', model_score: 1, termination: 'checkmate', adjudicated: false,
  plies: 40, acpl_model: 12.5, cost_usd: 0.0004, ...over,
});

function series(games: SeriesGame[]): Series {
  const rated = games.filter((g) => g.model_score !== undefined).map((g) => ({ opponentElo: g.level_elo, score: g.model_score! }));
  return {
    id: 'S1', name: "Jev's quick", model: 'liquid/d1-ultra', arm: 'hinted', status: 'finished',
    size: { preset: 'quick' }, ladder_version: 2, seed: 1, budget_usd: 0.5, cost_usd: 0.01,
    games, blocks: [], elo: estimate(rated), elo_history: [], secondary: {} as Series['secondary'],
    created_at: '2026-10-30T00:00:00Z',
  };
}

describe('CSV', () => {
  it('quotes RFC 4180 fields and leaves nulls empty', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'he said "hi"'], [null, 'line\nbreak']]))
      .toBe('a,b\n"x,y","he said ""hi"""\n,"line\nbreak"\n');
    expect(toCsv([], [])).toBe('\n');
  });

  it('series CSV has the exact header and one row per game', () => {
    const s = series([sg(), sg({ game_id: 'G2', index: 1, model_score: 0, acpl_model: undefined, adjudicated: true })]);
    const lines = seriesCsv(s).trimEnd().split('\n');
    expect(lines[0]).toBe(SERIES_CSV_HEADER.join(','));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('0,0,uci1500,1583,white,1-0,1,checkmate,0,40,12.5,0.0004,G1');
    expect(lines[2]!.endsWith(',G2')).toBe(true);
    expect(lines[2]).toContain(',0,checkmate,1,40,,0.0004,G2');
  });

  it('round-trips the rating input through the CSV (estimate within ±0.5)', () => {
    const games = [
      sg({ level_elo: 1583, model_score: 1 }),
      sg({ game_id: 'G2', index: 1, level_elo: 1037, model_score: 0 }),
      sg({ game_id: 'G3', index: 2, level_elo: 819, model_score: 1 }),
      sg({ game_id: 'G4', index: 3, level_elo: 1744, model_score: 0.5 }),
    ];
    const s = series(games);
    const [, ...rows] = seriesCsv(s).trimEnd().split('\n');
    const rebuilt = rows.map((line) => {
      const cols = line.split(',');
      const levelElo = Number(cols[3]);
      const score = Number(cols[6]) as 0 | 0.5 | 1;
      return { opponentElo: levelElo, score };
    });
    expect(rebuilt).toHaveLength(4);
    expect(Math.abs(estimate(rebuilt).mean - s.elo!.mean)).toBeLessThanOrEqual(0.5);
    expect(estimate(rebuilt).lo).toBeCloseTo(s.elo!.lo, 6);
  });

  it('leaderboard CSV has the exact header and one row per arm', () => {
    const row: LeaderRow = {
      arm_id: 'liquid/d1-ultra#hinted', model: 'liquid/d1-ultra', arm: 'hinted', series_id: 'S1',
      status: 'finished', games: 25, elo: { mean: 895, lo: 734, hi: 1057, half_width: 161.5, games: 25, w: 11, d: 2, l: 12, score_pct: 0.48 },
      w: 11, d: 2, l: 12, score_pct: 0.48, acpl: 140.8, acceptable_rate: 0.83, blunder_rate: 0.12,
      cost_usd: 0.0091, cost_per_game: 0.00037, separated_from: [],
    };
    const out = leaderboardCsv([row, { ...row, arm_id: 'other', acpl: null }]);
    const lines = out.trimEnd().split('\n');
    expect(lines[0]).toBe(LEADERBOARD_CSV_HEADER.join(','));
    expect(lines[1]).toBe('liquid/d1-ultra#hinted,liquid/d1-ultra,hinted,S1,finished,25,895,734,1057,11,2,12,0.48,140.8,0.83,0.12,0.0091');
    expect(lines[2]).toContain('other');
    expect(lines[2]!.split(',')[13]).toBe('');
  });
});
