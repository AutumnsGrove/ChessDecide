/** Series types and live events. Spec: docs/API.md §3.3. Pure: no runtime imports. */
import type { EloEstimate } from './elo.ts';
import type { SeriesStats } from './metrics.ts';
import type { SeriesSize } from './series.ts';
import type { Arm, ArmName, Color } from './types.ts';

export interface SeriesConfig {
  name?: string;
  model: string;
  arm: ArmName | Arm;
  size: SeriesSize;
  ladder: { mode: 'adaptive' } | { mode: 'fixed'; level: string };
  seed?: number;
  budget_usd: number;
  concurrency?: 1 | 2;
  judge_depth?: number;
}

export type SeriesStatus =
  | 'created' | 'running' | 'paused' | 'finished' | 'stopped_budget' | 'stopped_error' | 'aborted';

export interface EloPoint { games: number; mean: number; lo: number; hi: number }

export interface Block {
  index: number; level_id: string; level_elo: number;
  games: number; score: number;                 // mean model score of finished games in the block
  posterior_before: number; posterior_after: number;
}

export interface SeriesGame {
  game_id: string; index: number; block: number;
  level_id: string; level_elo: number;
  model_color: Color;
  status: string; result: string;
  model_score?: 0 | 0.5 | 1;
  termination: string; adjudicated: boolean; plies: number;
  acpl_model?: number; cost_usd: number;
}

export interface Series {
  id: string; name: string; model: string; arm: string;
  status: SeriesStatus; status_reason?: string;
  size: SeriesSize; ladder_version: number; seed: number;
  budget_usd: number; cost_usd: number;
  games: SeriesGame[]; blocks: Block[];
  elo: EloEstimate | null;
  elo_history: EloPoint[];
  secondary: SeriesStats;
  created_at: string;
}

export interface SeriesSummary {
  id: string; name: string; model: string; arm: string;
  status: SeriesStatus; size: SeriesSize; games_done: number;
  elo: EloEstimate | null;
  cost_usd: number; created_at: string;
}

export type SeriesEvent =
  | { event: 'snapshot'; data: Series }
  | { event: 'block'; data: { index: number; level_id: string; level_elo: number; reason?: string } }
  | { event: 'game_started'; data: { game_id: string; index: number; block: number; level_id: string; model_color: Color } }
  | { event: 'game_finished'; data: SeriesGame }
  | { event: 'elo'; data: { estimate: EloEstimate; point: EloPoint } }
  | { event: 'spend'; data: { series_usd: number; cap_usd: number; session_usd?: number } }
  | { event: 'status'; data: { status: SeriesStatus; status_reason?: string } }
  | { event: 'error'; data: { code: string; message: string; game_id?: string } };
