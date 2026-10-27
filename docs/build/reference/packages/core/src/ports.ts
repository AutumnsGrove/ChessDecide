/** Ports: the only I/O the core needs. Adapters live in other packages. */
import type {
  Color, Decision, EngineInfo, Game, Move, Ply, PositionEval, Uci,
} from './types.ts';
import type { Oracle } from './oracle.ts';

export interface MoveContext {
  game: Game; fen: string; historySan: string[]; legal: Move[]; ply: number; side: Color;
}
export interface PlayerMove {
  uci: Uci;
  decision?: Decision | null;                 // model players
  probs?: Record<Uci, number>;                // renormalised, full, model players (not persisted)
  engine_info?: EngineInfo | null;            // engine players
  cost_usd?: number | null;                   // money spent on this move (model calls); null/undefined = 0
}
export interface Player {
  kind: 'model' | 'engine';
  /** May throw. Transport errors have already been retried inside the player. */
  move(ctx: MoveContext, signal?: AbortSignal): Promise<PlayerMove>;
}

export interface JudgePort {
  /** Full per-move oracle for `fen` (cached by the adapter). */
  oracle(fen: string, depth: number): Promise<Oracle>;
  /** One search of `fen`: score for the side to move and WDL for the side to move. */
  evalPosition(fen: string, depth: number): Promise<{ cp_stm: number; wdl_stm: [number, number, number] }>;
}

export interface GameStore {
  saveGame(game: Game): Promise<void>;        // upsert game row (without plies)
  savePly(gameId: string, ply: Ply): Promise<void>; // upsert by (gameId, ply.ply)
}

export type GameEvent =
  | { event: 'snapshot'; data: Game }
  | { event: 'thinking'; data: { ply: number; side: Color; by: 'model' | 'engine'; started_at: string } }
  | { event: 'ply'; data: Ply }
  | { event: 'judged'; data: { ply: number; eval: PositionEval | null; judge: Ply['judge'] } }
  | { event: 'status'; data: { status: Game['status']; status_reason?: string } }
  | { event: 'spend'; data: { game_usd: number } }
  | { event: 'error'; data: { code: string; message: string; ply?: number } };

export interface EventSink { emit(gameId: string, e: GameEvent): void }

export interface BudgetPort {
  /** Called before a model call. `ok:false` stops the game with status `stopped_budget`. */
  check(game: Game): { ok: boolean; reason?: string };
}

export interface Ports {
  player(side: Color, game: Game): Player;
  judge: JudgePort;
  store: GameStore;
  events: EventSink;
  budget: BudgetPort;
  now(): string;                               // ISO 8601 UTC
}
