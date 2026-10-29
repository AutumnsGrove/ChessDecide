/** Typed fetch helpers for the ChessDecide HTTP API (docs/API.md). Errors carry the envelope fields. */
import type { EloEstimate, Game, GameConfig, LadderFile, PlayerDesc, Series, SeriesConfig, SeriesGame, SeriesSummary } from '@chessdecide/core';
import type { GameEstimate, ModelInfo, SeriesEstimate } from '@chessdecide/providers';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detail: unknown = {},
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function read<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => null) as any;
  if (!r.ok) {
    const e = body?.error;
    throw new ApiClientError(r.status, e?.code ?? 'http_error', e?.message ?? `HTTP ${r.status}`, e?.detail ?? {});
  }
  return body as T;
}

export const getJson = async <T>(path: string): Promise<T> => read<T>(await fetch(path));

export const postJson = async <T>(path: string, body?: unknown): Promise<T> => read<T>(await fetch(path, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}));

export interface Health {
  ok: boolean;
  mode: 'local' | 'public' | 'live';
  version: string;
  control: boolean;
  mock: boolean;
  engine: { ok: boolean; version: string };
  openrouter: { key_present: boolean };
  ladder: { version: number; calibrated: boolean };
  budget: { session_usd: number; today_usd: number; total_usd: number };
}

export interface Spend { usd: number; calls: number; cache_hits: number }

/** Row shape of `GET /api/games` (a summary, not the full game). */
export interface GameSummary {
  id: string;
  status: Game['status'];
  result: Game['result'];
  termination: Game['termination'];
  white: PlayerDesc;
  black: PlayerDesc;
  series_id: string | null;
  level_id: string | null;
  cost_usd: number;
  created_at: string;
  plies: number;
}

export const listGames = (limit = 50) => getJson<GameSummary[]>(`/api/games?limit=${limit}`);
export const getGame = (id: string) => getJson<Game>(`/api/games/${encodeURIComponent(id)}`);
export const createGame = (config: GameConfig) => postJson<Game>('/api/games', config);
export const gameAction = (id: string, action: 'auto' | 'pause' | 'step' | 'stop', body?: unknown) =>
  postJson<{ id: string; status: Game['status']; status_reason?: string }>(`/api/games/${encodeURIComponent(id)}/${action}`, body);
export const getModels = () => getJson<ModelInfo[]>('/api/models');
export const estimate = (config: GameConfig) => postJson<GameEstimate>('/api/estimate', config);
export const estimateSeriesConfig = (config: SeriesConfig) => postJson<SeriesEstimate>('/api/estimate', config);
export const getSpend = (since: 'session' | 'today' | 'all' = 'session') => getJson<Spend>(`/api/spend?since=${since}`);
export const getHealth = () => getJson<Health>('/api/health');
export const getLadder = () => getJson<LadderFile>('/api/ladder');

export const listSeries = () => getJson<SeriesSummary[]>('/api/series');
export const getSeries = (id: string) => getJson<Series>(`/api/series/${encodeURIComponent(id)}`);
export const getSeriesGames = (id: string) => getJson<SeriesGame[]>(`/api/series/${encodeURIComponent(id)}/games`);
export const createSeries = (config: SeriesConfig) => postJson<Series>('/api/series', config);
export const seriesAction = (id: string, action: 'start' | 'pause' | 'stop' | 'resume') =>
  postJson<{ id: string; status: Series['status']; status_reason?: string }>(`/api/series/${encodeURIComponent(id)}/${action}`);

/** `GET /api/leaderboard` (docs/API.md §3.5). One row per arm on one ladder version. */
export interface LeaderRow {
  arm_id: string; model: string; arm: string; series_id: string; status: Series['status'];
  games: number; elo: EloEstimate; w: number; d: number; l: number; score_pct: number;
  acpl: number | null; acceptable_rate: number | null; blunder_rate: number | null;
  cost_usd: number; cost_per_game: number | null; separated_from: string[];
}
export interface LeaderReference { id: string; label: string; elo: number }
export interface Leaderboard {
  ladder: { version: number; calibrated: boolean };
  rows: LeaderRow[];
  reference: LeaderReference[];
}
export interface CompareResult {
  a: { arm_id: string; model: string; arm: string; series_id: string; games: number };
  b: { arm_id: string; model: string; arm: string; series_id: string; games: number };
  p_a_gt_b: number; diff_mean: number; diff_lo: number; diff_hi: number;
}

export const getLeaderboard = (version?: number) =>
  getJson<Leaderboard>(`/api/leaderboard${version === undefined ? '' : `?ladder_version=${version}`}`);
export const compareLeaderArms = (a: string, b: string) =>
  getJson<CompareResult>(`/api/leaderboard/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
