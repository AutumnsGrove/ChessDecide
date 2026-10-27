import { describe, expect, it } from 'vitest';
import { ARM_PRESETS } from '../src/types.ts';
import { legalMoves } from '../src/chess.ts';
import { build, orderMoves, parse, ParseError, requestHash } from '../src/prompts.ts';

const FEN = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
const pos = { fen: FEN, historySan: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6'] };
const legal = legalMoves(FEN);

describe('build', () => {
  it('clean arm: bare UCI keys, no hints, exact key order', () => {
    const b = build({ model: 'typesafe/jev-1.14', position: pos, legal, arm: ARM_PRESETS.clean });
    const state = b.body.state as any;
    expect(Object.keys(state)).toEqual(['game', 'fen', 'side_to_move', 'move_number', 'history_san']);
    expect(state.history_san).toEqual(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6']);
    const q = (b.body.questions as any).move;
    expect(q.type).toBe('choice');
    expect(q.instructions).toBe('Choose the strongest legal chess move for White in this position.');
    expect(q.criteria['h5f7']).toBe('Queen h5 to f7');
    expect(q.criteria['c4b5']).toBe('Bishop c4 to b5');
    expect(Object.keys(q.criteria)).toEqual([...Object.keys(q.criteria)].sort());
    expect(b.json).not.toMatch(/captures|check|castles/);
    expect(b.keyToUci['h5f7']).toBe('h5f7');
  });
  it('hinted arm: SAN keys, annotated text, in_check', () => {
    const b = build({ model: 'm', position: pos, legal, arm: ARM_PRESETS.hinted });
    const state = b.body.state as any;
    expect(Object.keys(state)).toEqual(['game', 'fen', 'side_to_move', 'move_number', 'in_check', 'history_san']);
    expect(state.in_check).toBe(false);
    const c = (b.body.questions as any).move.criteria;
    expect(c['Qxf7#']).toBe('Queen h5 to f7, captures pawn, checkmate');
    expect(b.keyToUci['Qxf7#']).toBe('h5f7');
  });
  it('history is truncated to the last 16 plies', () => {
    const h = Array.from({ length: 30 }, (_, i) => `m${i}`);
    const b = build({ model: 'm', position: { fen: FEN, historySan: h }, legal, arm: ARM_PRESETS.clean });
    expect((b.body.state as any).history_san).toEqual(h.slice(-16));
  });
  it('image arm: state is an array with an image_url part and no FEN', () => {
    const b = build({ model: 'm', position: pos, legal, arm: ARM_PRESETS.image, imageDataUrl: 'data:image/png;base64,AAAA' });
    const s = b.body.state as any[];
    expect(s[0]).toEqual({ game: 'chess', side_to_move: 'white', move_number: 4 });
    expect(s[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } });
    expect(b.json).not.toContain(FEN);
    expect((b.body.questions as any).move.instructions.startsWith('This image shows the current position.')).toBe(true);
    expect(() => build({ model: 'm', position: pos, legal, arm: ARM_PRESETS.image })).toThrow();
  });
  it('refuses forced moves (<2 options)', () => {
    const one = legalMoves('8/2Q4p/p5pk/1ppbp3/3B2P1/P2P2bP/3P4/1R5K w - - 1 33');
    expect(one.length).toBe(1);
    expect(() => build({ model: 'm', position: { fen: '8/2Q4p/p5pk/1ppbp3/3B2P1/P2P2bP/3P4/1R5K w - - 1 33', historySan: [] }, legal: one, arm: ARM_PRESETS.clean })).toThrow(/at least 2/);
  });
  it('ordering: reverse and seeded shuffle are deterministic', () => {
    const rev = orderMoves(legal, 'reverse').map((m) => m.uci);
    expect(rev).toEqual(orderMoves(legal, 'sorted').map((m) => m.uci).reverse());
    const a = orderMoves(legal, { shuffle: 7 }).map((m) => m.uci);
    const b = orderMoves(legal, { shuffle: 7 }).map((m) => m.uci);
    expect(a).toEqual(b);
    expect(a).not.toEqual(orderMoves(legal, 'sorted').map((m) => m.uci));
    expect([...a].sort()).toEqual(orderMoves(legal, 'sorted').map((m) => m.uci));
  });
  it('request hash is stable and sensitive to repeat', async () => {
    const b = build({ model: 'm', position: pos, legal, arm: ARM_PRESETS.clean });
    expect(await requestHash('m', b.json, 0)).toBe(await requestHash('m', b.json, 0));
    expect(await requestHash('m', b.json, 0)).not.toBe(await requestHash('m', b.json, 1));
  });
});

describe('parse', () => {
  const k = { e2e4: 'e2e4', d2d4: 'd2d4', g1f3: 'g1f3' };
  const ok = {
    id: 'x', model: 'typesafe/jev-1.14-20261001', provider: 'TypeSafe',
    answers: { move: { type: 'choice', choice: 'e2e4', probabilities: { e2e4: 0.5, d2d4: 0.3, g1f3: 0.2 }, confidence: 0.5 } },
    usage: { input_tokens: 900, output_tokens: 250, cost: 0.00004 },
  };
  it('parses a good response', () => {
    const p = parse(ok, k);
    expect(p.pickUci).toBe('e2e4');
    expect(p.pPick).toBeCloseTo(0.5, 9);
    expect(p.probSumWarn).toBe(false);
    expect(p.usage).toEqual({ input_tokens: 900, output_tokens: 250, cost_usd: 0.00004 });
  });
  it('maps SAN keys back to UCI', () => {
    const p = parse({ answers: { move: { type: 'choice', choice: 'Qxf7#', probabilities: { 'Qxf7#': 1 } } } }, { 'Qxf7#': 'h5f7' });
    expect(p.pickUci).toBe('h5f7');
  });
  it('renormalises and warns when the raw sum is off', () => {
    const p = parse({ answers: { move: { type: 'choice', choice: 'e2e4', probabilities: { e2e4: 0.3, d2d4: 0.1, g1f3: 0.1 } } } }, k);
    expect(p.probSum).toBeCloseTo(0.5, 9);
    expect(p.probSumWarn).toBe(true);
    expect(p.pPick).toBeCloseTo(0.6, 9);
  });
  const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as ParseError).code; } return 'none'; };
  it('typed errors', () => {
    expect(code(() => parse(null, k))).toBe('bad_json');
    expect(code(() => parse({ answers: {} }, k))).toBe('missing_answer');
    expect(code(() => parse({ answers: { move: { type: 'noul', noul: 1 } } }, k))).toBe('unexpected_type');
    expect(code(() => parse({ answers: { move: { type: 'choice', choice: 'a1a2' } } }, k))).toBe('invalid_choice');
    expect(code(() => parse({ answers: { move: { type: 'choice', choice: 'e2e4', probabilities: { zzzz: 1 } } } }, k))).toBe('invalid_probs');
    expect(code(() => parse({ answers: { move: { type: 'choice', choice: 'e2e4', probabilities: { e2e4: 1.5 } } } }, k))).toBe('invalid_probs');
  });
  it('missing usage fields become null, not 0', () => {
    const p = parse({ answers: { move: { type: 'choice', choice: 'e2e4' } } }, k);
    expect(p.usage).toEqual({ input_tokens: null, output_tokens: null, cost_usd: null });
    expect(p.probs).toBeUndefined();
  });
});
