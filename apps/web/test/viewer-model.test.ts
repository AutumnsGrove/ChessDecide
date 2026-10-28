import { describe, expect, it } from 'vitest';
import type { Game, Ply } from '@chessdecide/core';
import { evalPct, graphPoints, leadSentence, resultLabel, statusLine, cplTone, decisionRows } from '../src/lib/viewer-model.ts';

const game = (over: Partial<Game> = {}): Game => ({
  id: 'g', status: 'finished', start_fen: 'x', adjudicated: false, plies: [], result: '*', termination: '', cost_usd: 0, created_at: '',
  config: { white: { type: 'model', model: 'typesafe/jev-1.14', arm: 'clean' }, black: { type: 'ladder', level: 'uci1500' }, opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1 }, ...over,
});
const ply = (over: Partial<Ply>): Ply => ({ ply: 1, side: 'white', by: 'model', uci: 'e2e4', san: 'e4', fen_after: 'x', created_at: '', ...over });
const judge = (cls: 'ok' | 'inaccuracy' | 'mistake' | 'blunder', cpl: number) => ({ depth: 14, best_uci: 'd2d4', best_san: 'd4', best_cp: 30, played_cp: 30 - cpl, cpl, win_loss: 0, class: cls, acceptable: cls === 'ok' });

const decision = (top_options: Array<{ uci: string; san: string; p: number; cpl?: number }>, over: Record<string, unknown> = {}) => ({
  model_slug: 'typesafe/jev-1.14', arm: 'clean', pick_uci: top_options[0]?.uci ?? 'e2e4', n_options: top_options.length,
  top_options, latency_ms: 190, usage: { input_tokens: 100, output_tokens: 0, cost_usd: 0.00004 },
  cache_hit: false, retries: 0, attempt_id: 1, ...over,
});

describe('viewer model', () => {
  it('evalPct is 50 at level and monotonic', () => {
    expect(evalPct(0)).toBeCloseTo(50, 9);
    expect(evalPct(300)).toBeGreaterThan(evalPct(100)); expect(evalPct(-300)).toBeLessThan(50);
  });
  it('lead sentence thresholds', () => {
    expect(leadSentence(10, 'A', 'B')).toBe('The position is level.');
    expect(leadSentence(100, 'A', 'B')).toBe('A is slightly ahead.');
    expect(leadSentence(-200, 'A', 'B')).toBe('B is clearly ahead.');
    expect(leadSentence(900, 'A', 'B')).toBe('A is far ahead.');
  });
  it('status lines use fixed templates over judge numbers', () => {
    const g = game();
    expect(statusLine(g, null).title).toBe('Start');
    const s = statusLine(g, ply({ judge: judge('mistake', 133) }));
    expect(s.tag?.kind).toBe('mistake'); expect(s.body).toBe('This cost about 1.3 pawns of advantage. Stockfish wanted d4.');
    expect(statusLine(g, ply({ judge: judge('inaccuracy', 56) })).body).toBe('A small slip, about 0.6 pawns. Stockfish preferred d4.');
    expect(statusLine(g, ply({ judge: judge('ok', 0) })).body).toBe('Matches what Stockfish would play.');
    expect(statusLine(g, ply({ forced: true })).tag?.kind).toBe('forced');
    expect(statusLine(g, ply({ by: 'engine', side: 'black' })).tag?.kind).toBe('engine');
  });
  it('result label is from the model point of view', () => {
    expect(resultLabel(game({ result: '1-0' }))).toBe('Model won');
    expect(resultLabel(game({ result: '0-1' }))).toBe('Model lost');
    expect(resultLabel(game({ result: '1/2-1/2' }))).toBe('Draw');
  });
  it('graphPoints starts at the centre line and has one point per ply', () => {
    const pts = graphPoints([ply({ eval: { depth: 1, white_eval_cp: 600, wdl: [0, 0, 0] } }), ply({ eval: { depth: 1, white_eval_cp: -600, wdl: [0, 0, 0] } })]).split(' ');
    expect(pts[0]).toBe('0,42'); expect(pts).toHaveLength(3); expect(pts[1]!.endsWith(',4.0')).toBe(true); expect(pts[2]!.endsWith(',80.0')).toBe(true);
  });

  it('decision rows sort by probability, include the pick and the Stockfish best, and tone by cpl', () => {
    const opts = Array.from({ length: 12 }, (_, i) => ({ uci: `a${String(i).padStart(2, '0')}`, san: `M${i}`, p: (12 - i) / 100, cpl: i * 10 }));
    opts.push({ uci: 'zpick', san: 'Pick', p: 0.001, cpl: 250 });
    const p = ply({
      decision: decision(opts, { pick_uci: 'zpick' }),
      judge: { ...judge('blunder', 250), best_uci: 'zbest', best_san: 'Best' },
    });
    const rows = decisionRows(p);
    expect(rows.length).toBeLessThanOrEqual(9);
    expect(rows.some((r) => r.isPick && r.uci === 'zpick')).toBe(true);
    expect(rows.some((r) => r.isBest && r.uci === 'zbest')).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.p).toBeGreaterThanOrEqual(rows[i]!.p);
    expect(rows.find((r) => r.uci === 'zpick')!.tone).toBe('blunder');
  });

  it('cpl tones: best, neutral, inaccuracy, mistake, blunder', () => {
    expect(cplTone(0)).toBe('best');
    expect(cplTone(20)).toBe('neutral');
    expect(cplTone(21)).toBe('inaccuracy');
    expect(cplTone(99)).toBe('inaccuracy');
    expect(cplTone(100)).toBe('mistake');
    expect(cplTone(200)).toBe('blunder');
  });

  it('hides the decision rows for engine, forced and undecided plies', () => {
    expect(decisionRows(ply({ by: 'engine' }))).toEqual([]);
    expect(decisionRows(ply({ forced: true, decision: decision([{ uci: 'e2e4', san: 'e4', p: 1, cpl: 0 }]) }))).toEqual([]);
    expect(decisionRows(ply({}))).toEqual([]);
  });
});
