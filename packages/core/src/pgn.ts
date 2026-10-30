/**
 * PGN export. Pure: a Game in, a string out. Tags and movetext follow docs/build/tasks/T11-exports.md.
 * Comments are fixed templates over Stockfish numbers and the model's own probability — never generated prose.
 */
import { ARM_PRESETS, START_FEN, type Arm, type ArmName, type Game, type PlayerDesc, type Ply } from './types.ts';
import { playerLabel } from './labels.ts';

export interface PgnOptions {
  /** `local` for the daemon, `chessdecide` for the deployed read-only site. */
  site?: 'local' | 'chessdecide';
  /** Line width for the movetext (PGN convention: 80). */
  width?: number;
}

const GLYPH: Record<string, string> = { inaccuracy: '?!', mistake: '?', blunder: '??' };
const ARM_NAMES = Object.keys(ARM_PRESETS) as ArmName[];

/** PGN tag values escape backslashes and quotes. */
const tagValue = (v: string) => `"${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** `2026-10-30T12:00:00Z` → `2026.10.30`. */
export function pgnDate(createdAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(createdAt);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : '????.??.??';
}

function armName(arm: Arm | ArmName): string {
  if (typeof arm === 'string') return arm;
  return ARM_NAMES.find((n) => JSON.stringify(ARM_PRESETS[n]) === JSON.stringify(arm)) ?? 'custom';
}

/** Eval in pawns from White POV, two decimals; clamped evals print ±10.00. */
export const evalPawns = (whiteEvalCp: number): string => (Math.max(-1000, Math.min(1000, whiteEvalCp)) / 100).toFixed(2);

/**
 * `{[%eval 0.23] p=0.31}` for a judged ply; `p=` only for a real model pick (not engine, not forced).
 * No eval means no comment rather than a made-up number.
 */
export function plyComment(p: Ply): string | undefined {
  if (!p.eval) return undefined;
  const pPick = p.by === 'model' && !p.forced && p.decision?.p_pick !== undefined
    ? ` p=${p.decision.p_pick.toFixed(2)}`
    : '';
  return `{[%eval ${evalPawns(p.eval.white_eval_cp)}]${pPick}}`;
}

/** The move number and side of the position in `start_fen` (PGN SetUp/FEN convention). */
function startPosition(startFen: string): { side: 'white' | 'black'; fullmove: number } {
  const parts = startFen.trim().split(/\s+/);
  return {
    side: parts[1] === 'b' ? 'black' : 'white',
    fullmove: Number(parts[5]) > 0 ? Number(parts[5]) : 1,
  };
}

function moveTokens(plies: readonly Ply[], startFen: string): string[][] {
  const start = startPosition(startFen);
  let side = start.side;
  let number = start.fullmove;
  return plies.map((p, i) => {
    if (p.side !== side) { number++; side = p.side; }
    const current = number;
    if (side === 'black') { number++; side = 'white'; } else side = 'black';
    const glyph = p.by === 'model' && !p.forced && p.judge ? (GLYPH[p.judge.class] ?? '') : '';
    const san = `${p.san}${glyph}`;
    const comment = plyComment(p);
    if (p.side === 'white') return [`${current}.`, san, ...(comment ? [comment] : [])];
    // A side that moves first (or a Black move after a gap) needs `N...`; otherwise it follows White.
    const needsNumber = i === 0 || plies[i - 1]!.side === 'black';
    return [...(needsNumber ? [`${current}...`] : []), san, ...(comment ? [comment] : [])];
  });
}

/** Greedy wrap on spaces, never splitting a token. */
function wrap(tokens: readonly string[], width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    if (line === '') { line = token; continue; }
    if (line.length + 1 + token.length <= width) { line += ` ${token}`; continue; }
    lines.push(line);
    line = token;
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** White/Black tag labels, e.g. `liquid/d1-ultra` and `Ladder uci1500`. */
export function pgnPlayers(game: Game): { white: string; black: string } {
  const label = (p: PlayerDesc) => playerLabel(p);
  return { white: label(game.config.white), black: label(game.config.black) };
}

export function gameToPgn(game: Game, opts: PgnOptions = {}): string {
  const players = pgnPlayers(game);
  const tags: [string, string][] = [
    ['Event', 'ChessDecide'],
    ['Site', opts.site ?? 'local'],
    ['Date', pgnDate(game.created_at)],
    ['Round', '-'],
    ['White', players.white],
    ['Black', players.black],
    ['Result', game.result],
    ['Termination', game.termination || '-'],
  ];
  if (game.start_fen !== START_FEN) tags.push(['SetUp', '1'], ['FEN', game.start_fen]);
  const model = [game.config.white, game.config.black].find((p) => p.type === 'model');
  if (model && model.type === 'model') {
    tags.push(['Model', model.model], ['Arm', armName(model.arm)]);
  }
  if (game.level_id) {
    tags.push(['Level', game.level_elo !== undefined ? `${game.level_id} (${Math.round(game.level_elo)})` : game.level_id]);
  }
  tags.push(['CostUSD', game.cost_usd.toFixed(6)]);

  const tokens = [...moveTokens(game.plies, game.start_fen).flat(), game.result];
  const lines = wrap(tokens, opts.width ?? 80);
  return `${tags.map(([k, v]) => `[${k} ${tagValue(v)}]`).join('\n')}\n\n${lines.join('\n')}\n`;
}
