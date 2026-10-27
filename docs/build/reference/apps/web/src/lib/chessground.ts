import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

export interface BoardParams { fen: string; lastMove?: [string, string]; check?: boolean; orientation?: 'white' | 'black' }

/** Svelte action: `<div use:board={{ fen, lastMove }}>`. The board is view-only. */
export function board(node: HTMLElement, params: BoardParams) {
  const cg: Api = Chessground(node, {
    fen: params.fen, viewOnly: true, coordinates: true,
    animation: { enabled: true, duration: 220 }, highlight: { lastMove: true, check: true }, drawable: { enabled: false },
  });
  const apply = (p: BoardParams) => cg.set({
    fen: p.fen, orientation: p.orientation ?? 'white', check: !!p.check,
    ...(p.lastMove ? { lastMove: p.lastMove as Key[] } : { lastMove: undefined }),
  });
  apply(params);
  return { update: apply, destroy: () => cg.destroy() };
}
