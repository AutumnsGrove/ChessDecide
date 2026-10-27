// Canonical shared types. Copy of docs/build/CONTRACTS.md. Pure: no runtime imports.

export type Uci = string;
export type Color = 'white' | 'black';

export interface Move {
  uci: Uci;            // e2e4, e1g1 (castling = king move), e7e8q (promotion, lowercase)
  san: string;         // Nf3, O-O, Qxf7#, e8=Q+
  from: string;
  to: string;
  promo?: 'q' | 'r' | 'b' | 'n';
  piece: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  captured?: 'p' | 'n' | 'b' | 'r' | 'q';
  capture: boolean;    // includes en passant
  ep: boolean;
  castle: 'k' | 'q' | null;
  check: boolean;
  mate: boolean;
}

export interface Position {
  fen: string;
  historySan: string[];  // from the start of the game, may be empty
}

export type Outcome =
  | 'checkmate' | 'stalemate' | 'insufficient' | 'threefold' | 'fifty_move' | 'none';

export interface Arm {
  interface: 'text' | 'image';
  key_format: 'uci' | 'san';
  descriptor: 'plain' | 'annotated';
  state_variant: 'slim' | 'full';
  template: 'neutral' | 'instructive' | 'minimal';
}
export type ArmName = 'clean' | 'hinted' | 'image';
export const ARM_PRESETS: Record<ArmName, Arm> = {
  clean:  { interface: 'text',  key_format: 'uci', descriptor: 'plain',     state_variant: 'slim', template: 'neutral' },
  hinted: { interface: 'text',  key_format: 'san', descriptor: 'annotated', state_variant: 'slim', template: 'neutral' },
  image:  { interface: 'image', key_format: 'uci', descriptor: 'plain',     state_variant: 'slim', template: 'neutral' },
};

export interface Usage { input_tokens: number; output_tokens: number; cost_usd: number | null }

export interface OptionProb {
  uci: Uci; san: string; p: number;
  cp?: number; cpl?: number; win_loss?: number;
}

export interface Decision {
  model_slug: string; returned_model?: string; provider?: string;
  arm: string;
  pick_uci: Uci; p_pick?: number; confidence?: number; n_options: number;
  top_options: OptionProb[];
  prob_sum?: number; latency_ms: number; usage: Usage;
  cache_hit: boolean; retries: number; attempt_id: number;
}

export type MoveClass = 'ok' | 'inaccuracy' | 'mistake' | 'blunder';

/** Static evaluation of the position AFTER a ply, White POV. Present on every judged ply. */
export interface PositionEval {
  depth: number;
  white_eval_cp: number;                  // clamped to [-1000, 1000]; forced mate = +-1000
  wdl: [number, number, number];          // [W, D, L] per mille, White POV
}

/** Quality of a MODEL ply (full per-move oracle). Engine plies have judge = null. */
export interface Judge {
  depth: number; best_uci: Uci; best_san: string; best_cp: number; played_cp: number;
  cpl: number; win_loss: number;          // win_loss in percentage points
  class: MoveClass;
  acceptable: boolean;
  p_acceptable?: number; e_win_loss?: number;   // need full probabilities
}

export interface EngineInfo {
  engine_id: string; level_id: string; elo: number; time_ms: number;
  random: boolean;                        // an ε-random move replaced the engine move
}

export interface Ply {
  ply: number;                            // 1-based
  side: Color;
  by: 'model' | 'engine';
  uci: Uci; san: string; fen_after: string;
  forced?: boolean;                       // exactly one legal move; no model call
  decision?: Decision | null;
  engine_info?: EngineInfo | null;
  eval?: PositionEval | null;             // null until judged (all plies)
  judge?: Judge | null;                   // model plies only; null until judged
  created_at: string;
}

export type PlayerDesc =
  | { type: 'model'; model: string; arm: ArmName | Arm }
  | { type: 'ladder'; level: string; engine?: string }
  | { type: 'engine'; elo: number; engine?: string };

export type OpeningSpec =
  | { type: 'startpos' }
  | { type: 'random4'; seed?: number }
  | { type: 'fen'; fen: string };

export interface GameConfig {
  white: PlayerDesc; black: PlayerDesc;
  opening: OpeningSpec;
  pace_ms: number; budget_usd: number; judge_depth: number;
  max_plies: number; adjudicate: boolean; seed: number;
}

export type GameStatus =
  | 'created' | 'ready' | 'running' | 'paused' | 'stopped_budget' | 'finished' | 'aborted';
export type Result = '1-0' | '0-1' | '1/2-1/2' | '*';
export type Termination =
  | 'checkmate' | 'stalemate' | 'repetition' | 'fifty_move' | 'insufficient'
  | 'max_plies' | 'adjudicated' | 'aborted' | '';

export interface Game {
  id: string;
  status: GameStatus; status_reason?: string;
  config: GameConfig; start_fen: string;
  series_id?: string; series_index?: number; level_id?: string; level_elo?: number;
  model_color?: Color;
  adjudicated: boolean;
  plies: Ply[];
  result: Result; termination: Termination;
  cost_usd: number;
  created_at: string;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const PROMPT_VERSION = 3;
export const METRICS_VERSION = 3;
