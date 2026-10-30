import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mulberry32, legalMoves, START_FEN, DEFAULT_LADDER } from '@chessdecide/core';
import { EngineJudge, NativeUciEngine, makeOpponent, parseInfo, lineCp } from '../src/index.ts';

const SF = process.env.STOCKFISH_PATH ?? (existsSync('/usr/games/stockfish') ? '/usr/games/stockfish' : existsSync('/opt/homebrew/bin/stockfish') ? '/opt/homebrew/bin/stockfish' : '');
const MATE1 = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
const sf = SF ? describe : describe.skip;

describe('parseInfo', () => {
  it('parses depth, multipv, cp, wdl, pv', () => {
    const l = parseInfo('info depth 14 seldepth 20 multipv 1 score cp 23 nodes 1000 nps 500000 hashfull 3 wdl 120 780 100 time 5 pv e2e4 e7e5 g1f3')!;
    expect(l).toMatchObject({ depth: 14, multipv: 1, cp: 23, wdl: [120, 780, 100], pv: ['e2e4', 'e7e5', 'g1f3'] });
  });
  it('parses mate scores and ignores bounds and strings', () => {
    expect(lineCp(parseInfo('info depth 5 score mate 1 pv h5f7')!)).toBe(1000);
    expect(lineCp(parseInfo('info depth 5 score mate -2 pv a1a2')!)).toBe(-1000);
    expect(parseInfo('info depth 5 score cp 10 lowerbound pv a1a2')).toBeNull();
    expect(parseInfo('info string NNUE evaluation using nn-xxxx.nnue')).toBeNull();
    expect(parseInfo('info currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfo('bestmove e2e4')).toBeNull();
  });
});

sf('native engine', () => {
  it('finds mate in one and parses WDL', async () => {
    const e = await NativeUciEngine.start({ path: SF, options: { Threads: 1, Hash: 16, UCI_ShowWDL: true } });
    const r = await e.search({ fen: MATE1, depth: 8 });
    expect(r.bestUci).toBe('h5f7');
    expect(r.lines[0]!.mate).toBe(1);
    await e.close();
  }, 30_000);
  it('recovers when the process dies mid-session', async () => {
    const e = await NativeUciEngine.start({ path: SF });
    e.kill();
    const r = await e.search({ fen: MATE1, depth: 6 });
    expect(r.bestUci).toBe('h5f7');
    await e.close();
  }, 30_000);
  it('oracle: mate-in-1 row, CPL 0 for best, wl >= 0 everywhere, second call is cached', async () => {
    const e = await NativeUciEngine.start({ path: SF });
    const judge = await EngineJudge.create([e]);
    const o = await judge.oracle(MATE1, 8);
    const mate = o.rows.find((r) => r.uci === 'h5f7')!;
    expect(mate.cp).toBe(1000); expect(mate.wp).toBe(100);
    expect(o.rows.map((r) => r.uci)).toEqual(legalMoves(MATE1).map((m) => m.uci));
    const best = Math.max(...o.rows.map((r) => r.wp));
    expect(o.rows.every((r) => best - r.wp >= 0)).toBe(true);
    const n = judge.searches;
    await judge.oracle(MATE1, 8);
    expect(judge.searches).toBe(n);                                  // cache hit: no engine use
    await e.close();
  }, 60_000);
  it('serializes concurrent judge calls (two series games can judge at once)', async () => {
    const e = await NativeUciEngine.start({ path: SF });
    const judge = await EngineJudge.create([e]);
    const [a, b] = await Promise.all([judge.evalPosition(START_FEN, 6), judge.evalPosition(MATE1, 6)]);
    expect(typeof a.cp_stm).toBe('number'); expect(typeof b.cp_stm).toBe('number');
    await e.close();
  }, 30_000);
  it('Stockfish 1320 opponent returns a legal move; eps level mixes in random moves', async () => {
    const rng = mulberry32(3);
    const lvl = DEFAULT_LADDER.levels.find((l) => l.id === 'eps50')!;
    const opp = await makeOpponent(lvl, () => NativeUciEngine.start({ path: SF }), rng, 20);
    let random = 0;
    for (let i = 0; i < 40; i++) {
      const m = await opp.move(START_FEN);
      expect(legalMoves(START_FEN).some((x) => x.uci === m.uci)).toBe(true);
      if (m.info.random) random++;
    }
    expect(random).toBeGreaterThan(8); expect(random).toBeLessThan(32);   // ~50 % of 40
    await opp.close();
  }, 60_000);
});

describe('search timeout', () => {
  it('kills a hung engine and reboots it instead of reading its late bestmove', async () => {
    // First process never answers `go`; every later one does. A reused first process would answer the
    // second search with the first search's stale line.
    const dir = mkdtempSync(join(tmpdir(), 'fake-uci-'));
    const marker = join(dir, 'booted');
    const bin = join(dir, 'fake-uci.mjs');
    writeFileSync(bin, `#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const hang = !existsSync(${JSON.stringify(marker)});
writeFileSync(${JSON.stringify(marker)}, '1');
createInterface({ input: process.stdin }).on('line', (l) => {
  if (l === 'uci') console.log('id name fake\\nuciok');
  else if (l === 'isready') console.log('readyok');
  else if (l.startsWith('go') && !hang) console.log('info depth 1 score cp 0 pv e2e4\\nbestmove e2e4');
  else if (l === 'quit') process.exit(0);
});
`);
    chmodSync(bin, 0o755);
    const e = await NativeUciEngine.start({ path: bin, searchTimeoutMs: 400 });
    const r = await e.search({ fen: START_FEN, depth: 1 });
    expect(r.bestUci).toBe('e2e4');
    await e.close();
  });
});
