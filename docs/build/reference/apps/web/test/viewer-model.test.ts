import { describe, expect, it } from 'vitest';
import type { Game, Ply } from '@chessdecide/core';
import { evalPct, graphPoints, leadSentence, resultLabel, statusLine } from '../src/lib/viewer-model.ts';

const game = (over: Partial<Game> = {}): Game => ({
  id: 'g', status: 'finished', start_fen: 'x', adjudicated: false, plies: [], result: '*', termination: '', cost_usd: 0, created_at: '',
  config: { white: { type: 'model', model: 'typesafe/jev-1.14', arm: 'clean' }, black: { type: 'ladder', level: 'uci1500' }, opening: { type: 'startpos' }, pace_ms: 0, budget_usd: 1, judge_depth: 14, max_plies: 200, adjudicate: true, seed: 1 }, ...over,
});
const ply = (over: Partial<Ply>): Ply => ({ ply: 1, side: 'white', by: 'model', uci: 'e2e4', san: 'e4', fen_after: 'x', created_at: '', ...over });
const judge = (cls: 'ok' | 'inaccuracy' | 'mistake' | 'blunder', cpl: number) => ({ depth: 14, best_uci: 'd2d4', best_san: 'd4', best_cp: 30, played_cp: 30 - cpl, cpl, win_loss: 0, class: cls, acceptable: cls === 'ok' });

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
});
