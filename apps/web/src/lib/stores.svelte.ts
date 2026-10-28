/** Small app-wide reactive store (Svelte 5 runes in a `.svelte.ts` module). */
import { getHealth, getSpend, type Health, type Spend } from './api.ts';

export type BannerKind = 'info' | 'warn' | 'error';

export interface Banner {
  id: number;
  kind: BannerKind;
  message: string;
  dismissible: boolean;
}

interface AppState {
  health: Health | null;
  spend: Spend | null;
  newGameOpen: boolean;
  newSeriesOpen: boolean;
  banners: Banner[];
  spendPulse: number;
}

export const app = $state<AppState>({
  health: null,
  spend: null,
  newGameOpen: false,
  newSeriesOpen: false,
  banners: [],
  spendPulse: 0,
});

let nextBannerId = 0;

export function showBanner(kind: BannerKind, message: string, opts: { dismissible?: boolean } = {}): number {
  const id = ++nextBannerId;
  app.banners.push({ id, kind, message, dismissible: opts.dismissible ?? true });
  return id;
}

export function dismissBanner(id: number): void {
  app.banners = app.banners.filter((b) => b.id !== id);
}

export function openNewGame(): void { app.newGameOpen = true; }
export function closeNewGame(): void { app.newGameOpen = false; }
export function openNewSeries(): void { app.newSeriesOpen = true; }
export function closeNewSeries(): void { app.newSeriesOpen = false; }

export async function loadHealth(): Promise<void> {
  try { app.health = await getHealth(); } catch { /* keep the last known health */ }
}

export async function loadSpend(): Promise<void> {
  try { app.spend = await getSpend('session'); } catch { /* read-only mode or daemon down */ }
}

/** Call after a game event so the header meter stays current without waiting for the poll. */
export function refreshSpend(): void { app.spendPulse++; }
