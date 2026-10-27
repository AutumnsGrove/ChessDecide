#!/usr/bin/env python3
"""Generate SAMPLE data for the UI mockups (not real model output).

Plays a Stockfish-limited-Elo "opponent" against a *simulated* decision model whose
probabilities are a noisy softmax over Stockfish's own move evals. Everything the mockups
show (evals, CPL, win% loss, per-ply probabilities) is real Stockfish output except the
model's P(...) values, which are synthetic. The UI labels this as sample data.

Usage: uv run --with chess python docs/mockups/tools/gen_sample_game.py
"""
import json, math, pathlib, random, shutil
import chess, chess.engine

OUT = pathlib.Path(__file__).resolve().parents[1]
SF = shutil.which("stockfish") or "/opt/homebrew/bin/stockfish"
DEPTH = 11
rng = random.Random(20261027)

def wp(cp):  # lichess-style win probability from centipawns (mover POV)
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * max(-1000, min(1000, cp)))) - 1)

def multipv(eng, board, n=40):
    infos = eng.analyse(board, chess.engine.Limit(depth=DEPTH), multipv=min(n, board.legal_moves.count()))
    out = []
    for i in infos:
        mv = i["pv"][0]
        sc = i["score"].pov(board.turn)
        out.append({"move": mv, "cp": max(-1000, min(1000, sc.score(mate_score=1000)))})
    return out

def options_for(board, lines, temp, noise):
    best = lines[0]["cp"]
    opts = []
    for l in lines:
        cpl = max(0, best - l["cp"])
        w = math.exp(-cpl / temp) * math.exp(rng.gauss(0, noise))
        opts.append({"san": board.san(l["move"]), "uci": l["move"].uci(), "cpl": cpl,
                     "win_loss": round(wp(best) - wp(l["cp"]), 1), "w": w})
    tot = sum(o["w"] for o in opts)
    for o in opts:
        o["p"] = round(o.pop("w") / tot, 4)
    opts.sort(key=lambda o: -o["p"])
    return opts

def pick(opts):
    r, acc = rng.random(), 0
    for o in opts:
        acc += o["p"]
        if r <= acc:
            return o
    return opts[0]

def classify(win_loss):
    if win_loss >= 20: return "blunder"
    if win_loss >= 10: return "mistake"
    if win_loss >= 5: return "inaccuracy"
    return "ok"

def main():
    eng = chess.engine.SimpleEngine.popen_uci(SF)
    eng.configure({"Threads": 1, "Hash": 64, "UCI_ShowWDL": True})
    opp = chess.engine.SimpleEngine.popen_uci(SF)
    opp.configure({"Threads": 1, "Hash": 32, "UCI_LimitStrength": True, "UCI_Elo": 1500})
    board = chess.Board()
    plies = []
    start_eval = 18
    try:
        while not board.is_game_over(claim_draw=True) and len(plies) < 96:
            model_turn = board.turn == chess.WHITE
            lines = multipv(eng, board)
            best = lines[0]
            rec = {"ply": len(plies) + 1, "side": "white" if board.turn else "black",
                   "by": "model" if model_turn else "engine",
                   "sf_best_san": board.san(best["move"]), "sf_best_uci": best["move"].uci()}
            if model_turn:
                opts = options_for(board, lines, temp=70, noise=0.9)
                chosen = pick(opts)
                mv = chess.Move.from_uci(chosen["uci"])
                conf = chosen["p"]
                rec["decision"] = {
                    "options": opts[:8], "n_options": board.legal_moves.count(),
                    "p_pick": chosen["p"], "confidence": round(conf * 0.97, 3),
                    "latency_ms": int(rng.uniform(520, 1250)),
                    "input_tokens": 700 + 28 * board.legal_moves.count(),
                }
                rec["decision"]["cost"] = round(rec["decision"]["input_tokens"] * 0.042e-6, 6)
                cpl, wl = chosen["cpl"], chosen["win_loss"]
            else:
                res = opp.play(board, chess.engine.Limit(time=0.05))
                mv = res.move
                m = next((l for l in lines if l["move"] == mv), None)
                cpl = max(0, best["cp"] - m["cp"]) if m else 0
                wl = round(wp(best["cp"]) - wp(m["cp"]), 1) if m else 0.0
            rec.update({"san": board.san(mv), "uci": mv.uci(), "cpl": cpl,
                        "win_loss": max(0.0, wl), "cls": classify(max(0.0, wl))})
            board.push(mv)
            rec["fen"] = board.fen()
            if board.is_game_over(claim_draw=True):
                ev_white = 1000 if board.is_checkmate() and not board.turn else (-1000 if board.is_checkmate() else 0)
            else:
                info = eng.analyse(board, chess.engine.Limit(depth=DEPTH))
                ev_white = max(-1000, min(1000, info["score"].white().score(mate_score=1000)))
                w = info["score"].white().wdl() if True else None
                rec["wdl"] = [w.wins, w.draws, w.losses]
            rec["eval_cp"] = ev_white
            plies.append(rec)
    finally:
        eng.quit(); opp.quit()
    outcome = board.outcome(claim_draw=True)
    result = outcome.result() if outcome else "*"
    model_plies = [p for p in plies if p["by"] == "model"]
    meta = {
        "sample": True,
        "title": "Sample game — simulated model vs Stockfish 1500",
        "white": {"name": "typesafe/jev-1.14", "kind": "decision (SIMULATED)"},
        "black": {"name": "Stockfish 19", "kind": "engine, Elo 1500"},
        "result": result, "termination": outcome.termination.name.lower() if outcome else "ongoing",
        "plies": len(plies), "start_fen": chess.STARTING_FEN, "judge": "Stockfish 19 · depth %d" % DEPTH,
        "acpl_model": round(sum(p["cpl"] for p in model_plies) / max(1, len(model_plies)), 1),
        "cost_total": round(sum(p["decision"]["cost"] for p in model_plies), 6),
        "avg_latency_ms": int(sum(p["decision"]["latency_ms"] for p in model_plies) / max(1, len(model_plies))),
    }
    # Compare position: a quiet middlegame ply with many reasonable moves.
    cmp_ply = next((p for p in plies if p["ply"] >= 21 and p["side"] == "white"), plies[20])
    prev_fen = plies[cmp_ply["ply"] - 2]["fen"]
    cb = chess.Board(prev_fen)
    lines = multipv(eng2 := chess.engine.SimpleEngine.popen_uci(SF), cb) if False else None
    eng2 = chess.engine.SimpleEngine.popen_uci(SF); eng2.configure({"Threads": 1, "Hash": 64})
    lines = multipv(eng2, cb); eng2.quit()
    jev = options_for(cb, lines, temp=55, noise=0.8)
    d1 = options_for(cb, lines, temp=130, noise=1.3)
    oracle = [{"san": cb.san(l["move"]), "uci": l["move"].uci(), "cp": l["cp"],
               "cpl": max(0, lines[0]["cp"] - l["cp"])} for l in lines]
    compare = {"fen": cb.fen(), "side": "white" if cb.turn else "black", "n_options": cb.legal_moves.count(),
               "sf_best": oracle[0], "oracle": oracle,
               "models": {"typesafe/jev-1.14": {"options": jev[:10], "latency_ms": 780, "cost": 0.000118},
                          "liquid/d1-ultra": {"options": d1[:10], "latency_ms": 1040, "cost": 0.000094}}}
    (OUT / "sample_game.js").write_text(
        "// SAMPLE DATA for mockups only (generated by tools/gen_sample_game.py)\n"
        "window.SAMPLE_GAME = " + json.dumps({"meta": meta, "plies": plies}, indent=1) + ";\n"
        "window.SAMPLE_COMPARE = " + json.dumps(compare, indent=1) + ";\n")
    print(meta)

main()
