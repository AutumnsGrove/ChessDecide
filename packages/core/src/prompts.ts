/** Request builders and response parser. Spec: docs/PROMPTS.md. Pure functions. */
import { descAnnotated, descPlain, isInCheck, moveNumber, sideToMove } from './chess.ts';
import { sha256Hex } from './hash.ts';
import { mulberry32, shuffled } from './rng.ts';
import type { Arm, Move, Position, Uci } from './types.ts';

export type OrderSpec = 'sorted' | 'reverse' | { shuffle: number };

export interface BuildInput {
  model: string;
  position: Position;
  legal: Move[];                 // from legalMoves(); any order
  arm: Arm;
  order?: OrderSpec;             // default 'sorted'
  imageDataUrl?: string;         // required when arm.interface === 'image'
}
export interface Built {
  body: Record<string, unknown>;       // the exact object to JSON.stringify and POST
  json: string;
  keyToUci: Record<string, Uci>;
  order: Uci[];                        // option order actually used (UCI)
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function orderMoves(legal: readonly Move[], order: OrderSpec = 'sorted'): Move[] {
  const sorted = [...legal].sort((a, b) => (a.uci < b.uci ? -1 : a.uci > b.uci ? 1 : 0));
  if (order === 'sorted') return sorted;
  if (order === 'reverse') return sorted.reverse();
  return shuffled(sorted, mulberry32(order.shuffle));
}

export function instructionsFor(arm: Arm, fen: string): string {
  const side = cap(sideToMove(fen));
  const base = `Choose the strongest legal chess move for ${side} in this position.`;
  let text: string;
  switch (arm.template) {
    case 'neutral': text = base; break;
    case 'instructive': text = `${base} Avoid losing material; prioritize checks, captures, and threats.`; break;
    case 'minimal': text = 'Best move?'; break;
  }
  return arm.interface === 'image' ? `This image shows the current position. ${text}` : text;
}

function stateFor(i: BuildInput, moves: Move[]): unknown {
  const { position: p, arm } = i;
  const side = sideToMove(p.fen);
  if (arm.interface === 'image') {
    if (!i.imageDataUrl) throw new Error('imageDataUrl required for the image arm');
    return [
      { game: 'chess', side_to_move: side, move_number: moveNumber(p.fen) },
      { type: 'image_url', image_url: { url: i.imageDataUrl } },
    ];
  }
  const hinted = arm.descriptor === 'annotated';
  const state: Record<string, unknown> = {
    game: 'chess',
    fen: p.fen,
    side_to_move: side,
    move_number: moveNumber(p.fen),
  };
  if (hinted) state.in_check = isInCheck(p.fen);
  state.history_san = p.historySan.slice(-16);
  if (arm.state_variant === 'full') {
    state.legal_moves = moves.map((m) => ({
      uci: m.uci,
      ...(hinted ? { san: m.san } : {}),
      desc: hinted ? descAnnotated(m) : descPlain(m),
    }));
  }
  return state;
}

export function build(i: BuildInput): Built {
  const moves = orderMoves(i.legal, i.order);
  if (moves.length < 2) throw new Error('a choice needs at least 2 options (play forced moves without a call)');
  const key = (m: Move) => (i.arm.key_format === 'uci' ? m.uci : m.san);
  const keyToUci: Record<string, Uci> = {};
  const criteria: Record<string, string> = {};
  for (const m of moves) {
    keyToUci[key(m)] = m.uci;
    criteria[key(m)] = i.arm.descriptor === 'plain' ? descPlain(m) : descAnnotated(m);
  }
  const body = {
    model: i.model,
    state: stateFor(i, moves),
    questions: {
      move: { type: 'choice', instructions: instructionsFor(i.arm, i.position.fen), criteria },
    },
  };
  return { body, json: JSON.stringify(body), keyToUci, order: moves.map((m) => m.uci) };
}

export async function requestHash(model: string, json: string, repeat: number): Promise<string> {
  return sha256Hex(`${model}\u0000${json}\u0000${repeat}`);
}

// ---------- response parsing ----------

export type ParseErrorCode = 'bad_json' | 'missing_answer' | 'unexpected_type' | 'invalid_choice' | 'invalid_probs';
export class ParseError extends Error {
  constructor(public code: ParseErrorCode, message: string) { super(message); this.name = 'ParseError'; }
}

export interface Parsed {
  pickUci: Uci;
  probs?: Record<Uci, number>;       // renormalised, keyed by UCI
  pPick?: number;                    // renormalised probability of the pick
  confidence?: number;
  probSum?: number;                  // raw sum
  probSumWarn: boolean;              // raw sum outside [0.9, 1.1]
  returnedModel?: string;
  provider?: string;
  usage: { input_tokens: number | null; output_tokens: number | null; cost_usd: number | null };
}

export function parse(resp: unknown, keyToUci: Record<string, Uci>): Parsed {
  if (typeof resp !== 'object' || resp === null) throw new ParseError('bad_json', 'response is not an object');
  const r = resp as Record<string, any>;
  const a = r.answers?.move;
  if (!a) throw new ParseError('missing_answer', 'answers.move is missing');
  if (a.type !== 'choice') throw new ParseError('unexpected_type', `expected choice, got ${String(a.type)}`);
  const pickKey = a.choice;
  if (typeof pickKey !== 'string' || !(pickKey in keyToUci)) {
    throw new ParseError('invalid_choice', `choice ${String(pickKey)} is not an option`);
  }
  let probs: Record<Uci, number> | undefined;
  let probSum: number | undefined;
  let probSumWarn = false;
  if (a.probabilities !== undefined && a.probabilities !== null) {
    const raw: Record<Uci, number> = {};
    let sum = 0;
    for (const [k, v] of Object.entries(a.probabilities as Record<string, unknown>)) {
      if (!(k in keyToUci)) throw new ParseError('invalid_probs', `unknown probability key ${k}`);
      if (typeof v !== 'number' || !(v >= 0 && v <= 1)) throw new ParseError('invalid_probs', `bad probability for ${k}`);
      raw[keyToUci[k]!] = v;
      sum += v;
    }
    probSum = sum;
    probSumWarn = sum < 0.9 || sum > 1.1;
    if (sum > 0) {
      probs = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / sum]));
    }
  }
  const pickUci = keyToUci[pickKey]!;
  const u = r.usage ?? {};
  return {
    pickUci,
    ...(probs ? { probs, pPick: probs[pickUci] ?? 0 } : {}),
    ...(typeof a.confidence === 'number' ? { confidence: a.confidence } : {}),
    ...(probSum !== undefined ? { probSum } : {}),
    probSumWarn,
    ...(typeof r.model === 'string' ? { returnedModel: r.model } : {}),
    ...(typeof r.provider === 'string' ? { provider: r.provider } : {}),
    usage: {
      input_tokens: typeof u.input_tokens === 'number' ? u.input_tokens : null,
      output_tokens: typeof u.output_tokens === 'number' ? u.output_tokens : null,
      cost_usd: typeof u.cost === 'number' ? u.cost : null,
    },
  };
}
