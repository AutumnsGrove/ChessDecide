/** Pure helpers for the Games screen: outcome wording, opponent labels, and filter state <-> URL. */
import type { BrowsedGame, LeaderReference } from './api.ts';
import { ARM_PRESETS, type Arm, type ArmName, type PlayerDesc } from '@chessdecide/core';

export type Outcome = 'won' | 'drawn' | 'lost' | 'live' | 'none';
export const OUTCOME_WORD: Record<Outcome, string> = { won: 'Won', drawn: 'Drew', lost: 'Lost', live: 'In progress', none: 'Unfinished' };

const isLive = (g: Pick<BrowsedGame, 'status'>) => g.status === 'running' || g.status === 'paused' || g.status === 'ready';
const modelSide = (g: Pick<BrowsedGame, 'white' | 'black'>): 'white' | 'black' | null =>
  g.white.type === 'model' ? 'white' : g.black.type === 'model' ? 'black' : null;

/** The model's result. Series games carry `model_score`; a single game without one falls back to the PGN result. */
export function outcomeOf(g: BrowsedGame): Outcome {
  if (isLive(g)) return 'live';
  if (typeof g.model_score === 'number') return g.model_score === 1 ? 'won' : g.model_score === 0.5 ? 'drawn' : 'lost';
  if (g.result === '*') return 'none';
  if (g.result === '1/2-1/2') return 'drawn';
  const side = modelSide(g);
  if (!side) return 'none';
  return (g.result === '1-0') === (side === 'white') ? 'won' : 'lost';
}

const TERMINATION: Record<string, string> = {
  checkmate: 'checkmate', stalemate: 'stalemate', repetition: 'repetition', fifty_move: 'the fifty-move rule',
  insufficient: 'insufficient material', max_plies: 'the move limit', adjudicated: 'adjudication', aborted: 'abort',
};
/** `Lost by checkmate`, `Drew by repetition`, or just `Won` when the reason is unknown. */
export function endingLabel(g: BrowsedGame): string {
  const o = outcomeOf(g);
  if (o === 'live' || o === 'none') return OUTCOME_WORD[o];
  const why = TERMINATION[g.termination] ?? '';
  return why ? `${OUTCOME_WORD[o]} by ${why}` : OUTCOME_WORD[o];
}

/** `hinted` for the string `'hinted'` or for a resolved arm object equal to that preset; null for a custom arm. */
export function armPresetName(arm: ArmName | Arm): string | null {
  if (typeof arm === 'string') return arm;
  for (const [name, preset] of Object.entries(ARM_PRESETS))
    if ((Object.keys(preset) as Array<keyof Arm>).every((k) => preset[k] === arm[k])) return name;
  return null;
}

/** The model that played, and its arm when it is a named preset. */
export function modelOf(g: Pick<BrowsedGame, 'white' | 'black'>): { model: string; arm: string | null } | null {
  const p: PlayerDesc | undefined = g.white.type === 'model' ? g.white : g.black.type === 'model' ? g.black : undefined;
  if (!p || p.type !== 'model') return null;
  return { model: p.model, arm: armPresetName(p.arm) };
}

/** The opponent as people would say it: the ladder's own label when known, else the level id. */
export function opponentLabel(g: Pick<BrowsedGame, 'white' | 'black' | 'level_id' | 'level_elo'>, reference: readonly LeaderReference[]): string {
  const other = g.white.type === 'model' ? g.black : g.white;
  const id = g.level_id ?? (other.type === 'ladder' ? other.level : null);
  const ref = id ? reference.find((r) => r.id === id) : undefined;
  if (ref) return ref.label;
  if (id) return id;
  return other.type === 'engine' ? `Stockfish ${other.elo}` : 'Opponent';
}

export const SORTS = { notable: 'Best results first', new: 'Newest', strongest: 'Strongest opponent', weakest: 'Weakest opponent' } as const;
export type SortKey = keyof typeof SORTS;
export const OUTCOMES = ['won', 'drawn', 'lost'] as const;

export interface GameFilters { model: string; arm: string; level: string; outcome: string; sort: SortKey; page: number }
export const EMPTY_FILTERS: GameFilters = { model: '', arm: '', level: '', outcome: '', sort: 'notable', page: 1 };

/** Read filter state from a URL, ignoring anything unknown so a hand-edited link still renders. */
export function filtersFrom(params: URLSearchParams): GameFilters {
  const sort = params.get('sort') as SortKey | null;
  const outcome = params.get('outcome') ?? '';
  const arm = params.get('arm') ?? '';
  const page = Number(params.get('page') ?? 1);
  return {
    model: params.get('model') ?? '', level: params.get('level') ?? '',
    arm: arm === 'clean' || arm === 'hinted' ? arm : '',
    outcome: (OUTCOMES as readonly string[]).includes(outcome) ? outcome : '',
    sort: sort && sort in SORTS ? sort : 'notable',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** `?model=..` with only the non-default parts, so the plain list has a clean URL. Any filter change resets the page. */
export function queryOf(f: Partial<GameFilters>): string {
  const q = new URLSearchParams();
  if (f.model) q.set('model', f.model);
  if (f.arm) q.set('arm', f.arm);
  if (f.level) q.set('level', f.level);
  if (f.outcome) q.set('outcome', f.outcome);
  if (f.sort && f.sort !== 'notable') q.set('sort', f.sort);
  if (f.page && f.page > 1) q.set('page', String(f.page));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const isFiltered = (f: GameFilters): boolean => !!(f.model || f.arm || f.level || f.outcome);

export function pageRange(total: number, page: number, per: number): { from: number; to: number; pages: number } {
  const pages = Math.max(1, Math.ceil(total / per));
  return { from: total === 0 ? 0 : (page - 1) * per + 1, to: Math.min(total, page * per), pages };
}

/** Opponent with its rating, `Stockfish 1320, 50% random (614)`; no rating when the game has none. */
export function opponentWithElo(g: Pick<BrowsedGame, 'white' | 'black' | 'level_id' | 'level_elo'>, reference: readonly LeaderReference[]): string {
  const name = opponentLabel(g, reference);
  const elo = g.level_elo === null ? null : Math.round(g.level_elo);
  // Ladder labels such as `Stockfish 1320` already carry a rating; only add one the label does not show.
  return elo === null || name.includes(String(elo)) ? name : `${name} (${elo})`;
}

/** `60 plies · $0.0006`, plus `adjudicated` when the game was ended early. Built as a list so no separator is ever dangling. */
export function gameFacts(g: Pick<BrowsedGame, 'plies' | 'cost_usd'>): string {
  return [`${g.plies} plies`, g.cost_usd ? `$${g.cost_usd.toFixed(4)}` : ''].filter(Boolean).join(' · ');
}
