"""CLI entry point. Usage: python -m src.main <command> [options]."""

import argparse
import json

from src.config import GAMES, keno_game, with_jackpots
from src.data.loader import load_draws
from src.pipelines.backtest import run_backtest
from src.pipelines.report import build, render_html
from src.pipelines.suggest import keno_suggest, suggest, value_summary
from src.analysis.randomness import run_all


def main() -> None:
    p = argparse.ArgumentParser(prog="vietlott-lab")
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("dashboard", help="run all analyses, write outputs/")
    d.add_argument("--games", nargs="*", choices=list(GAMES))
    d.add_argument("--no-backtest", action="store_true")
    d.add_argument(
        "--render-only", action="store_true", help="re-render from analysis.json"
    )

    b = sub.add_parser("backtest", help="walk-forward backtest of all strategies")
    b.add_argument("game", choices=list(GAMES))
    b.add_argument("--tickets", type=int, default=30)
    b.add_argument("--max-eval", type=int)
    b.add_argument("--spot", type=int, default=10, help="Keno spot level")
    b.add_argument("--jackpot", type=float, nargs="*", help="jackpot value(s), VND")

    t = sub.add_parser("test", help="randomness tests")
    t.add_argument("game", choices=list(GAMES))

    s = sub.add_parser("suggest", help="suggest tickets")
    s.add_argument("game", choices=list(GAMES))
    s.add_argument("-n", type=int, default=5)
    s.add_argument("--seed", type=int)
    s.add_argument("--spot", type=int, help="Keno spot level (default: best RTP)")

    a = p.parse_args()
    if a.cmd == "dashboard":
        if a.render_only:
            render_html()
        else:
            build(a.games, run_bt=not a.no_backtest)
    elif a.cmd == "backtest":
        game = keno_game(a.spot) if a.game == "keno" else GAMES[a.game]
        game = with_jackpots(game, [int(j) for j in a.jackpot or []])
        for r in run_backtest(load_draws(game), a.tickets, max_eval=a.max_eval):
            print(
                f"{r.strategy:<18} lift={r.lift_pct:+6.2f}% "
                f"CI95=[{r.lift_ci95[0]:+.2f},{r.lift_ci95[1]:+.2f}] "
                f"p_holm={r.p_holm:.3f} ROI={r.roi_gross_pct:+.1f}%"
            )
    elif a.cmd == "test":
        for r in run_all(load_draws(GAMES[a.game])):
            print(f"{r['test']:<55} p={r['p_value']:.4f}  {r['detail']}")
    elif a.cmd == "suggest":
        if a.game == "keno":
            print(json.dumps(keno_suggest(a.n, a.spot, a.seed), indent=2))
            return
        print(json.dumps(value_summary(GAMES[a.game]), indent=2))
        for t in suggest(load_draws(GAMES[a.game]), a.n, seed=a.seed):
            sp = f" | special {t.special}" if t.special else ""
            print(f"{t.numbers}{sp}  popularity={t.popularity}")


if __name__ == "__main__":
    main()
