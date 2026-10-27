#!/usr/bin/env python3
"""M0 protocol spikes for ChessDecide. Throwaway code; never commit a key.

Usage:
  OPENROUTER_API_KEY=... uv run --with chess python spikes/m0_decisions.py probe
  OPENROUTER_API_KEY=... uv run --with chess python spikes/m0_decisions.py all
"""
import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request

import chess

BASE = "https://openrouter.ai"
DECISIONS_URL = BASE + "/api/alpha/decisions"
CHAT_URL = BASE + "/api/v1/chat/completions"

KEY = os.environ.get("OPENROUTER_API_KEY", "")
DECISION_MODELS = [
    "typesafe/jev-1.14",
    "liquid/d1-ultra",
    "microsoft/microsoft-decision-1",
    "openai/gpt-6-luna-decisions",
]
TEXT_MODEL = "mistralai/mistral-nemo"
TEXT_MODELS = [
    "deepseek/deepseek-v4.1-flash-1017",
    "anthropic/claude-haiku-5.5",
    "openai/gpt-6-luna",
    "xiaomi/mimo-v2.6-flash",
    "z-ai/glm-5.3-flash",
    "meta/muse-spark-1.3-contributor",
]
REASONING_EFFORT = os.environ.get("REASONING_EFFORT", "low")
TEXT_MAX_TOKENS = int(os.environ.get("TEXT_MAX_TOKENS", "4096"))

PIECE = {
    chess.PAWN: "pawn", chess.KNIGHT: "knight", chess.BISHOP: "bishop",
    chess.ROOK: "rook", chess.QUEEN: "queen", chess.KING: "king",
}


def post(url, payload, timeout=180):
    if not KEY:
        sys.exit("OPENROUTER_API_KEY is not set")
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "X-Title": "ChessDecide spike",
        },
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode()
        return json.loads(body), (time.perf_counter() - t0) * 1000, None
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return None, (time.perf_counter() - t0) * 1000, f"HTTP {e.code}: {body[:800]}"
    except Exception as e:  # noqa: BLE001
        return None, (time.perf_counter() - t0) * 1000, f"{type(e).__name__}: {e}"


def describe(board, move):
    san = board.san(move)
    if board.is_castling(move):
        side = "kingside" if board.is_kingside_castling(move) else "queenside"
        return f"{san}: castle {side}"
    piece = board.piece_at(move.from_square)
    name = PIECE.get(piece.piece_type, "piece") if piece else "piece"
    out = f"{san}: {name} {chess.square_name(move.from_square)}->{chess.square_name(move.to_square)}"
    if board.is_capture(move):
        out += ", capture"
    if move.promotion:
        out += f", promotes to {PIECE[move.promotion]}"
    board.push(move)
    if board.is_checkmate():
        out += ", checkmate"
    elif board.is_check():
        out += ", check"
    board.pop()
    return out


def moveset(board):
    return [
        {"uci": m.uci(), "san": board.san(m), "desc": describe(board, m)}
        for m in board.legal_moves
    ]


def state_for(board, history):
    return {
        "game": "chess",
        "fen": board.fen(),
        "side_to_move": "white" if board.turn == chess.WHITE else "black",
        "move_number": board.fullmove_number,
        "in_check": board.is_check(),
        "history_san": history[-12:],
        "legal_moves": moveset(board),
    }


def pick_order(items, order, seed=0):
    items = list(items)
    if order == "reverse":
        return list(reversed(items))
    if order == "shuffle":
        random.Random(seed).shuffle(items)
    return items


def ask_decisions(model, board, history, *, limit=None, order="forward", opaque=False,
                  extra_questions=False, seed=0):
    infos = moveset(board)
    if limit:
        infos = infos[:limit]
    infos = pick_order(infos, order, seed)

    criteria = {}
    for i, info in enumerate(infos):
        key = f"m{i + 1:02d}" if opaque else info["san"]
        criteria[key] = info["desc"]

    state = state_for(board, history)
    if opaque:
        state["legal_moves"] = [
            {"key": f"m{i + 1:02d}", "uci": x["uci"], "san": x["san"], "desc": x["desc"]}
            for i, x in enumerate(infos)
        ]

    questions = {
        "move": {
            "type": "choice",
            "instructions": f"Choose the strongest legal chess move for {'White' if board.turn == chess.WHITE else 'Black'} in this position.",
            "criteria": criteria,
        }
    }
    if extra_questions:
        questions["eval"] = {
            "type": "score",
            "instructions": "How good is this position for the side to move?",
            "criteria": ["losing", "worse", "equal", "better", "winning"],
        }
        questions["mate"] = {
            "type": "noul",
            "instructions": "Does the side to move have a forced mate in two or fewer moves?",
            "criteria": {"true": "A forced mate exists.", "false": "No forced mate."},
        }

    payload = {"model": model, "state": state, "questions": questions}
    data, ms, err = post(DECISIONS_URL, payload)
    return {"model": model, "ms": ms, "err": err, "data": data, "infos": infos,
            "order": order, "opaque": opaque}


def summarize(res, show_probs=6):
    if res["err"]:
        return f"  ERROR {res['err']}"
    data = res["data"]
    ans = (data.get("answers") or {}).get("move")
    if not ans:
        return f"  NO MOVE ANSWER keys={list((data.get('answers') or {}).keys())} body={json.dumps(data)[:500]}"
    probs = ans.get("probabilities") or {}
    top = sorted(probs.items(), key=lambda kv: -kv[1])[:show_probs]
    usage = data.get("usage") or {}
    return (
        f"  pick={ans.get('choice')!r} conf={ans.get('confidence')} "
        f"sum_p={sum(probs.values()):.3f} latency={res['ms']:.0f}ms "
        f"in={usage.get('input_tokens')} out={usage.get('output_tokens')} "
        f"cost=${usage.get('cost', 0):.6f} n_opts={len(res['infos'])} order={res['order']}\n"
        f"  top={[(k, round(v, 3)) for k, v in top]}"
    )


def rich_position(min_moves=60, trials=600, plies=90):
    rng = random.Random(7)
    best = (0, chess.STARTING_FEN, [])
    for _ in range(trials):
        b = chess.Board()
        hist = []
        for _ in range(plies):
            if b.is_game_over():
                break
            m = rng.choice(list(b.legal_moves))
            hist.append(b.san(m))
            b.push(m)
            n = b.legal_moves.count()
            if n > best[0]:
                best = (n, b.fen(), list(hist))
            if n >= min_moves:
                return best
    return best


def positions():
    start = chess.Board()
    start_hist = []
    n, rich_fen, rich_hist = rich_position()
    print(f"startpos options: {start.legal_moves.count()}")
    print(f"rich position options: {n}\n  fen={rich_fen}\n  last={rich_hist[-8:]}\n")
    return (start, start_hist), (chess.Board(rich_fen), rich_hist)


def cmd_probe():
    (start, start_hist), _ = positions()
    print("== probe: 3 models on startpos ==")
    for model in DECISION_MODELS:
        res = ask_decisions(model, start, start_hist, extra_questions=True)
        print(model)
        print(summarize(res))
        if res["data"]:
            print("  answers:", {k: v.get("type") for k, v in (res["data"].get("answers") or {}).items()})
        print()


def cmd_sweep():
    _, (rich, rich_hist) = positions()
    counts = sorted({5, 20, 40, rich.legal_moves.count()})
    print(f"== option-count sweep on rich position ({rich.legal_moves.count()} legal) ==")
    print(f"counts={counts}")
    for model in DECISION_MODELS[:3]:
        print(f"\n{model}")
        for c in counts:
            res = ask_decisions(model, rich, rich_hist, limit=c)
            print(f" n={c}")
            print(summarize(res, show_probs=3))


def cmd_determinism():
    _, (rich, rich_hist) = positions()
    print("== determinism: same request x5 ==")
    for model in DECISION_MODELS[:3]:
        print(f"\n{model}")
        for i in range(5):
            res = ask_decisions(model, rich, rich_hist, limit=40)
            print(f"  {i+1}: {summarize(res, show_probs=0)}")


def cmd_order():
    _, (rich, rich_hist) = positions()
    print("== order/key sensitivity (40 options, jev) ==")
    model = "typesafe/jev-1.14"
    runs = []
    for opaque in (False, True):
        for order in ("forward", "reverse", "shuffle"):
            for rep in range(2):
                res = ask_decisions(model, rich, rich_hist, limit=40, order=order,
                                    opaque=opaque, seed=rep)
                print(f"opaque={opaque} order={order} rep={rep}")
                print(summarize(res, show_probs=2))
                runs.append(res)
    # first/last bias
    for res in runs:
        if res["err"] or not res["data"]:
            continue
        ans = res["data"]["answers"]["move"]
        keys = list(ans["probabilities"].keys())
        if not keys:
            continue
        choice = ans["choice"]
        print(f"  opaque={res['opaque']} order={res['order']} first={keys[0]} last={keys[-1]} pick={choice} "
              f"p_first={ans['probabilities'][keys[0]]:.3f} p_last={ans['probabilities'][keys[-1]]:.3f}")


def extract_san(text, board):
    legal = {board.san(m) for m in board.legal_moves}
    norm = {s.replace("+", "").replace("#", ""): s for s in legal}
    for token in re.findall(r"\b(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b", text):
        if token in legal:
            return token
        if token.replace("+", "").replace("#", "") in norm:
            return norm[token.replace("+", "").replace("#", "")]
    return None


def ask_chat_text(model, board, history):
    sysmsg = "You are a strong chess engine. Reply with exactly one legal move in SAN and nothing else."
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": sysmsg},
                     {"role": "user", "content": chat_prompt(board)}],
        "temperature": 0,
        "max_tokens": TEXT_MAX_TOKENS,
        "reasoning": {"effort": REASONING_EFFORT},
    }
    data, ms, err = post(CHAT_URL, payload)
    if err:
        return {"err": err, "ms": ms}
    msg = (data.get("choices") or [{}])[0].get("message", {})
    content = msg.get("content") or ""
    return {"ms": ms, "raw": content, "reasoning": (msg.get("reasoning") or "")[:120],
            "san": extract_san(content, board), "usage": data.get("usage")}


def chat_prompt(board):
    return (f"FEN: {board.fen()}\nSide to move: {'White' if board.turn else 'Black'}\n"
            f"Legal moves: {', '.join(board.san(m) for m in board.legal_moves)}\n"
            "Best move?")


def ask_chat_tool(model, board, history):
    sans = [board.san(m) for m in board.legal_moves]
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": chat_prompt(board)}],
        "temperature": 0,
        "max_tokens": TEXT_MAX_TOKENS,
        "reasoning": {"effort": REASONING_EFFORT},
        "tools": [{
            "type": "function",
            "function": {
                "name": "make_move",
                "description": "Play a legal chess move.",
                "parameters": {
                    "type": "object",
                    "properties": {"move": {"type": "string", "enum": sans}},
                    "required": ["move"],
                },
            },
        }],
        "tool_choice": {"type": "function", "function": {"name": "make_move"}},
        "provider": {"require_parameters": True},
    }
    data, ms, err = post(CHAT_URL, payload)
    if err:
        return {"err": err, "ms": ms}
    msg = (data.get("choices") or [{}])[0].get("message", {})
    calls = msg.get("tool_calls") or []
    san = None
    if calls:
        try:
            san = json.loads(calls[0]["function"]["arguments"]).get("move")
        except Exception:  # noqa: BLE001
            pass
    return {"ms": ms, "raw": msg, "san": san, "usage": data.get("usage")}


def ask_chat_json(model, board, history):
    sans = [board.san(m) for m in board.legal_moves]
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": chat_prompt(board)}],
        "temperature": 0,
        "max_tokens": TEXT_MAX_TOKENS,
        "reasoning": {"effort": REASONING_EFFORT},
        "provider": {"require_parameters": True},
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "chess_move",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {"move": {"type": "string", "enum": sans}},
                    "required": ["move"],
                    "additionalProperties": False,
                },
            },
        },
    }
    data, ms, err = post(CHAT_URL, payload)
    if err:
        return {"err": err, "ms": ms}
    msg = (data.get("choices") or [{}])[0].get("message", {})
    content = msg.get("content") or ""
    try:
        san = json.loads(content).get("move")
    except Exception:  # noqa: BLE001
        san = None
    return {"ms": ms, "raw": content, "san": san, "usage": data.get("usage")}


def normal_middlegame():
    b = chess.Board()
    for san in ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3", "Nf6", "O-O", "d6", "c3", "O-O"]:
        b.push_san(san)
    return b, ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3", "Nf6", "O-O", "d6", "c3", "O-O"]


def cmd_text():
    (start, start_hist), _ = positions()
    mid, mid_hist = normal_middlegame()
    print(f"== text protocols ({TEXT_MODEL}) ==")
    print(f"middlegame options: {mid.legal_moves.count()}")
    for name, fn in (("free-text", ask_chat_text), ("tool", ask_chat_tool), ("json", ask_chat_json)):
        for label, board, hist in (("start", start, start_hist), ("mid", mid, mid_hist)):
            res = fn(TEXT_MODEL, board, hist)
            if res.get("usage"):
                u = res["usage"]
                res = {**res, "usage": {k: u.get(k) for k in ("prompt_tokens", "completion_tokens", "cost")}}
            res.pop("raw", None)
            print(f"{name:9} {label:5} {res}")


def cmd_order2():
    _, (rich, rich_hist) = positions()
    print("== order sensitivity, aligned by SAN (40 options, jev) ==")
    model = "typesafe/jev-1.14"
    for opaque in (False, True):
        for order in ("forward", "reverse", "shuffle"):
            res = ask_decisions(model, rich, rich_hist, limit=40, order=order, opaque=opaque, seed=0)
            if res["err"] or not res["data"]:
                print(f"opaque={opaque} order={order}: ERROR {res['err']}")
                continue
            ans = res["data"]["answers"]["move"]
            probs = ans.get("probabilities") or {}
            key_to_san = {}
            for i, info in enumerate(res["infos"]):
                key = f"m{i + 1:02d}" if opaque else info["san"]
                key_to_san[key] = info["san"]
            pick_key = ans["choice"]
            pick_san = key_to_san.get(pick_key, pick_key)
            # rank in the input order
            keys_in_order = list(key_to_san.keys())
            rank = keys_in_order.index(pick_key) if pick_key in keys_in_order else -1
            # is response probability order the same as input order?
            preserved = [k for k in probs.keys() if k in key_to_san] == [k for k in keys_in_order if k in probs]
            print(f"opaque={opaque} order={order}: pick_key={pick_key} pick_san={pick_san} "
                  f"rank={rank}/{len(keys_in_order)} p_pick={probs.get(pick_key, 0):.3f} "
                  f"p_first={probs.get(keys_in_order[0], 0):.3f} p_last={probs.get(keys_in_order[-1], 0):.3f} "
                  f"order_preserved={preserved} latency={res['ms']:.0f}ms")
            print(f"   top={[(key_to_san.get(k, k), round(v, 3)) for k, v in sorted(probs.items(), key=lambda kv: -kv[1])[:5]]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["probe", "sweep", "determinism", "order", "order2", "text", "all"])
    args = ap.parse_args()
    cmds = {
        "probe": cmd_probe,
        "sweep": cmd_sweep,
        "determinism": cmd_determinism,
        "order": cmd_order,
        "order2": cmd_order2,
        "text": cmd_text,
    }
    if args.cmd == "all":
        for name in ("probe", "sweep", "determinism", "order2", "text"):
            print(f"\n######## {name} ########")
            cmds[name]()
    else:
        cmds[args.cmd]()


if __name__ == "__main__":
    main()
