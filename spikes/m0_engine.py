#!/usr/bin/env python3
"""M0 engine spike: Stockfish best move, eval, WDL, and CPL for model picks.

Usage: uv run --with chess python spikes/m0_engine.py
"""
import json
import shutil

import chess
import chess.engine

SF = shutil.which("stockfish") or "/opt/homebrew/bin/stockfish"
DEPTH = 18


def open_engine():
    eng = chess.engine.SimpleEngine.popen_uci(SF)
    eng.configure({"Threads": 1, "Hash": 64, "UCI_ShowWDL": True})
    return eng


def analyse(eng, board, depth=DEPTH):
    info = eng.analyse(board, chess.engine.Limit(depth=depth))
    score = info["score"].pov(board.turn)
    cp = score.score(mate_score=100000)
    wdl = None
    try:
        w = score.wdl()
        wdl = (w.wins, w.draws, w.losses)  # per-mille, side-to-move POV
    except Exception:  # noqa: BLE001
        pass
    return {
        "best": info["pv"][0].uci() if info.get("pv") else None,
        "san": board.san(info["pv"][0]) if info.get("pv") else None,
        "cp": cp,
        "wdl": wdl,
        "depth": info.get("depth"),
        "nodes": info.get("nodes"),
    }


def cpl_for(eng, board, sans, depth=DEPTH):
    ref = analyse(eng, board, depth)
    print(f"  reference: best={ref['san']} ({ref['best']}) cp={ref['cp']} wdl={ref['wdl']}")
    rows = []
    for san in sans:
        mv = board.parse_san(san)
        after = board.copy()
        after.push(mv)
        ev = analyse(eng, after, depth)
        # ev cp is from the opponent's POV after the move; negate for the mover
        cp_after = -ev["cp"]
        cpl = max(0, ref["cp"] - cp_after)
        wdl_loss = None
        if ref["wdl"] and ev["wdl"]:
            # win probability for the mover (draw = 0.5)
            p_best = (ref["wdl"][0] + 0.5 * ref["wdl"][1]) / 1000
            p_after = (ev["wdl"][2] + 0.5 * ev["wdl"][1]) / 1000
            wdl_loss = round(100 * (p_best - p_after), 2)
        rows.append({"san": san, "cp_after": cp_after, "cpl": cpl, "win_loss_pct": wdl_loss})
        print(f"    {san:8} cp={cp_after:>7} cpl={cpl:>5} win_loss={wdl_loss}%")
    return ref, rows


def main():
    print("stockfish:", SF)
    eng = open_engine()
    try:
        print("id:", eng.id)

        mid = chess.Board()
        for san in ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "d3", "Nf6", "O-O", "d6", "c3", "O-O"]:
            mid.push_san(san)
        print(f"\n== middlegame {mid.fen()} ==")
        cpl_for(eng, mid, ["Bxf7+", "d4", "Nxe5", "Ng5", "Re1", "h3", "a3"])

        print("\n== startpos ==")
        cpl_for(eng, chess.Board(), ["e4", "d4", "Nf3", "f3", "a3"])

        print("\n== Elo ladder on startpos ==")
        for elo in (1320, 1800, 2400, 3190):
            eng.configure({"UCI_LimitStrength": True, "UCI_Elo": elo})
            info = eng.analyse(chess.Board(), chess.engine.Limit(depth=10))
            print(f"  UCI_Elo={elo}: best={chess.Board().san(info['pv'][0])} depth={info.get('depth')}")
        eng.configure({"UCI_LimitStrength": False})
    finally:
        eng.quit()


if __name__ == "__main__":
    main()
