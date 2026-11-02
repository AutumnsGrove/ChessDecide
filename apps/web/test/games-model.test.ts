import { describe, expect, it } from 'vitest';
import type { BrowsedGame } from '../src/lib/api.ts';
import { endingLabel, EMPTY_FILTERS, filtersFrom, gameFacts, isFiltered, modelOf, opponentLabel, opponentWithElo, outcomeOf, pageRange, queryOf } from '../src/lib/games-model.ts';

const game = (over: Partial<BrowsedGame> = {}): BrowsedGame => ({
  id: 'g1', status: 'finished', result: '0-1', termination: 'checkmate', adjudicated: false,
  white: { type: 'model', model: 'baseten/mammoth-1', arm: 'hinted' }, black: { type: 'ladder', level: 'eps15' },
  series_id: 's1', series_index: 0, level_id: 'eps15', level_elo: 1037, model_color: 'white', model_score: 0,
  plies: 35, cost_usd: 0.002, created_at: '2026-01-01T00:00:00Z', final_fen: 'f', ...over,
});

describe('outcome and ending', () => {
  it('reads the model result from model_score', () => {
    expect(outcomeOf(game({ model_score: 1 }))).toBe('won');
    expect(outcomeOf(game({ model_score: 0.5 }))).toBe('drawn');
    expect(outcomeOf(game())).toBe('lost');
  });
  it('falls back to the PGN result for a single game, from the model side', () => {
    expect(outcomeOf(game({ model_score: null, result: '1-0' }))).toBe('won');
    expect(outcomeOf(game({ model_score: null, result: '1/2-1/2' }))).toBe('drawn');
    const black = game({ model_score: null, result: '1-0', white: { type: 'ladder', level: 'x' }, black: { type: 'model', model: 'a/b', arm: 'clean' } });
    expect(outcomeOf(black)).toBe('lost');
    expect(outcomeOf(game({ model_score: null, result: '*' }))).toBe('none');
  });
  it('running games are live whatever the score says', () => {
    expect(outcomeOf(game({ status: 'running', model_score: null, result: '*' }))).toBe('live');
  });
  it('names how a game ended', () => {
    expect(endingLabel(game())).toBe('Lost by checkmate');
    expect(endingLabel(game({ model_score: 0.5, termination: 'fifty_move' }))).toBe('Drew by the fifty-move rule');
    expect(endingLabel(game({ termination: '' }))).toBe('Lost');
    expect(endingLabel(game({ status: 'running' }))).toBe('In progress');
  });
});

describe('labels', () => {
  const ref = [{ id: 'eps15', label: 'Stockfish 1320, 15% random', elo: 1037 }];
  it('finds the model and its arm, resolving an arm object back to its preset', () => {
    expect(modelOf(game())).toEqual({ model: 'baseten/mammoth-1', arm: 'hinted' });
    expect(modelOf(game({ white: { type: 'model', model: 'a/b', arm: { interface: 'text', key_format: 'san', descriptor: 'annotated', state_variant: 'slim', template: 'neutral' } } }))?.arm).toBe('hinted');
    expect(modelOf(game({ white: { type: 'model', model: 'a/b', arm: { interface: 'text', key_format: 'uci', descriptor: 'plain', state_variant: 'slim', template: 'neutral' } } }))?.arm).toBe('clean');
    expect(modelOf(game({ white: { type: 'model', model: 'a/b', arm: { interface: 'x' } as never } }))?.arm).toBeNull();
    expect(modelOf(game({ white: { type: 'ladder', level: 'a' } }))).toBeNull();
  });
  it('prefers the ladder label and falls back to the level id', () => {
    expect(opponentLabel(game(), ref)).toBe('Stockfish 1320, 15% random');
    expect(opponentLabel(game({ level_id: 'zzz' }), ref)).toBe('zzz');
    expect(opponentWithElo(game(), ref)).toBe('Stockfish 1320, 15% random (1037)');
    expect(opponentWithElo(game({ level_elo: null }), ref)).toBe('Stockfish 1320, 15% random');
    expect(opponentWithElo(game({ level_id: 'uci1320', level_elo: 1320 }), [{ id: 'uci1320', label: 'Stockfish 1320', elo: 1320 }])).toBe('Stockfish 1320');
    expect(opponentWithElo(game({ level_id: 'random', level_elo: 160 }), [{ id: 'random', label: 'Random mover', elo: 160 }])).toBe('Random mover (160)');
    expect(gameFacts(game())).toBe('35 plies · $0.0020');
    expect(gameFacts(game({ cost_usd: 0 }))).toBe('35 plies');
  });
});

describe('filter state in the URL', () => {
  it('round-trips, keeping the plain list URL empty', () => {
    expect(queryOf(EMPTY_FILTERS)).toBe('');
    const f = { ...EMPTY_FILTERS, model: 'a/b', arm: 'hinted', outcome: 'won', sort: 'new' as const, page: 3 };
    expect(filtersFrom(new URLSearchParams(queryOf(f)))).toEqual({ ...f, level: '' });
  });
  it('ignores unknown values from a hand-edited link', () => {
    expect(filtersFrom(new URLSearchParams('?arm=weird&outcome=maybe&sort=plies&page=-2'))).toEqual(EMPTY_FILTERS);
    expect(isFiltered(EMPTY_FILTERS)).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTERS, level: 'eps15' })).toBe(true);
  });
  it('computes the visible range and page count', () => {
    expect(pageRange(2102, 1, 24)).toEqual({ from: 1, to: 24, pages: 88 });
    expect(pageRange(2102, 88, 24)).toEqual({ from: 2089, to: 2102, pages: 88 });
    expect(pageRange(0, 1, 24)).toEqual({ from: 0, to: 0, pages: 1 });
  });
});
