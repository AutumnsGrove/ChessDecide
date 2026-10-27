#!/usr/bin/env python3
"""M0 head-to-head on one quiet middlegame + one mate-in-1.

Decision models (choice) vs the six standard text models in tool and free-text modes.
Scored with Stockfish 19 at depth 18 (CPL and win-probability loss).

Usage: OPENROUTER_API_KEY=... uv run --with chess python spikes/m0_compare.py
"""
import importlib.util
import json
import os
import pathlib
import shutil
import time

import chess
import chess.engine

spec = importlib.util.spec_from_file_location("m0", pathlib.Path(__file__).with_name("m0_decisions.py"))
m0 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m0)

SF = shutil.which("stockfish") or "/opt/homebrew/bin/stockfish"
DEPTH = 18
OUT = pathlib.Path(__file__).with_name("out")
OUT.mkdir(exist_ok=True)

DECISION_MODELS = [
    "typesafe/jev-1.14",
    "liquid/d1-ultra",
    "microsoft/microsoft-decision-1",
    "openai/gpt-6-luna-decisions",
]


def mid_board():
    b = chess.Board()
    hist = []
    for san in ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3", "Nf6", "O-O", "d6", "c3", "O-O"]:
        b.push_san(san)
        hist.append(san)
    return b, hist


def mate1_board():
    return chess.Board("r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4"), []


def analyse(eng, board):
    info = eng.analyse(board, chess.engine.Limit(depth=DEPTH))
    sc = info["score"].pov(board.turn)
    cp = sc.score(mate_score=100000)
    wdl = None
    try:
        w = sc.wdl()
        wdl = (w.wins, w.draws, w.losses)
    except Exception:  # noqa: BLE001
        pass
    return {"cp": cp, "wdl": wdl, "san": board.san(info["pv"][0]),
            "uci": info["pv"][0].uci(), "mate": sc.is_mate()}, info


def score_move(eng, board, ref, san, cache):
    if not san:
        return {"cpl": None, "win_loss": None, "mate": False, "err": "no move"}
    try:
        mv = board.parse_san(san)
    except Exception as e:  # noqa: BLE001
        return {"cpl": None, "win_loss": None, "mate": False, "err": f"illegal {san}: {e}"}
    if mv.uci() == ref["uci"]:
        return {"cpl": 0, "win_loss": 0.0, "mate": ref["mate"]}
    key = mv.uci()
    if key not in cache:
        after = board.copy()
        after.push(mv)
        ev, _ = analyse(eng, after)
        cache[key] = ev
    ev = cache[key]
    cp_after = -ev["cp"]
    cpl = max(0, ref["cp"] - cp_after) if abs(ref["cp"]) < 90000 else None
    win_loss = None
    if ref["wdl"] and ev["wdl"] and abs(ref["cp"]) < 90000:
        p_best = (ref["wdl"][0] + 0.5 * ref["wdl"][1]) / 1000
        p_after = (ev["wdl"][2] + 0.5 * ev["wdl"][1]) / 1000
        win_loss = round(100 * (p_best - p_after), 2)
    return {"cpl": cpl, "win_loss": win_loss, "mate": ev["mate"] and ev["cp"] < 0,
            "cp_after": cp_after}


def decision_run(eng, board, hist, ref, cache):
    rows = []
    for model in DECISION_MODELS:
        r = m0.ask_decisions(model, board, hist, extra_questions=True)
        if r["err"] or not r["data"]:
            rows.append({"model": model, "mode": "decisions", "err": r["err"], "ms": r["ms"]})
            continue
        ans = (r["data"].get("answers") or {}).get("move")
        usage = r["data"].get("usage") or {}
        if not ans:
            rows.append({"model": model, "mode": "decisions", "err": "no move answer", "ms": r["ms"]})
            continue
        san = ans.get("choice")
        probs = ans.get("probabilities") or {}
        sc = score_move(eng, board, ref, san, cache)
        rows.append({
            "model": model, "mode": "decisions", "san": san,
            "confidence": ans.get("confidence"), "p_best": probs.get(ref["san"]),
            "p_pick": probs.get(san), "n_opts": len(r["infos"]),
            "ms": round(r["ms"]), "cost": usage.get("cost"),
            "input_tokens": usage.get("input_tokens"), "output_tokens": usage.get("output_tokens"),
            "answers": {k: v.get("type") for k, v in (r["data"].get("answers") or {}).items()},
            **sc,
        })
    return rows


def text_run(eng, board, hist, ref, cache, modes=("tool", "text")):
    rows = []
    fns = {"tool": m0.ask_chat_tool, "text": m0.ask_chat_text, "json": m0.ask_chat_json}
    for model in m0.TEXT_MODELS:
        for mode in modes:
            r = fns[mode](model, board, hist)
            if r.get("err"):
                rows.append({"model": model, "mode": mode, "err": r["err"], "ms": round(r.get("ms", 0))})
                continue
            u = r.get("usage") or {}
            sc = score_move(eng, board, ref, r.get("san"), cache)
            rows.append({
                "model": model, "mode": mode, "san": r.get("san"),
                "ms": round(r.get("ms", 0)), "cost": u.get("cost"),
                "input_tokens": u.get("prompt_tokens") or u.get("input_tokens"),
                "output_tokens": u.get("completion_tokens") or u.get("output_tokens"),
                "reasoning_tokens": (u.get("completion_tokens_details") or {}).get("reasoning_tokens"),
                "finish": ((r.get("raw") or {}).get("finish_reason") if isinstance(r.get("raw"), dict) else None),
                **sc,
            })
    return rows


def show(rows):
    print(f"{'model':45} {'mode':9} {'san':9} {'cpl':>5} {'win%':>6} {'p(best)':>7} {'ms':>6} {'out':>5} {'cost':>9}")
    for x in rows:
        print(f"{x['model']:45} {x.get('mode',''):9} {str(x.get('san')):9} "
              f"{str(x.get('cpl')):>5} {str(x.get('win_loss')):>6} {str(x.get('p_best')):>7} "
              f"{str(x.get('ms')):>6} {str(x.get('output_tokens')):>5} "
              f"{('$%.6f' % x['cost']) if x.get('cost') is not None else '-':>9}"
              f"{('  ERR ' + str(x['err'])[:60]) if x.get('err') else ''}")


def main():
    os.environ.setdefault("REASONING_EFFORT", "low")
    eng = chess.engine.SimpleEngine.popen_uci(SF)
    eng.configure({"Threads": 1, "Hash": 64, "UCI_ShowWDL": True})
    all_rows = {}
    try:
        for label, (board, hist) in (("mid", mid_board()), ("mate1", mate1_board())):
            ref, _ = analyse(eng, board)
            print(f"\n===== {label} {board.fen()} =====")
            print(f"SF{DEPTH} best={ref['san']} ({ref['uci']}) cp={ref['cp']} wdl={ref['wdl']} mate={ref['mate']}")
            print(f"legal: {board.legal_moves.count()}")
            cache = {}
            t0 = time.time()
            d = decision_run(eng, board, hist, ref, cache)
            t = text_run(eng, board, hist, ref, cache)
            print(f"\n-- decision models ({time.time()-t0:.0f}s) --")
            show(d)
            print("\n-- text models --")
            show(t)
            print(f"\ncost decision: ${sum(x.get('cost') or 0 for x in d):.6f}")
            print(f"cost text:     ${sum(x.get('cost') or 0 for x in t):.6f}")
            all_rows[label] = {"ref": ref, "decision": d, "text": t}
    finally:
        eng.quit()
    (OUT / "m0_compare.json").write_text(json.dumps(all_rows, indent=2, default=str))
    print(f"\nwrote {OUT / 'm0_compare.json'}")


if __name__ == "__main__":
    main()
