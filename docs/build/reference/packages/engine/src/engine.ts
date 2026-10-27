/** Engine port (docs/ARCHITECTURE.md §2). Adapters: NativeUciEngine now, HttpEngine later. */
export interface SearchLine {
  multipv: number; depth: number;
  cp?: number;                              // centipawns, side-to-move POV
  mate?: number;                            // moves to mate, side-to-move POV (negative = being mated)
  wdl?: [number, number, number];           // [W, D, L] per mille, side-to-move POV
  pv: string[];                             // UCI moves
}
export interface SearchRequest {
  fen: string; depth?: number; movetimeMs?: number; multipv?: number;
  options?: Record<string, string | number | boolean>;
}
export interface SearchResult { bestUci: string; lines: SearchLine[]; }
export interface Engine {
  readonly id: string;                      // e.g. "stockfish"
  version(): Promise<string>;               // e.g. "Stockfish 19"
  search(req: SearchRequest): Promise<SearchResult>;
  close(): Promise<void>;
}
export type EngineFactory = () => Promise<Engine>;
