"""Run every analysis for all games and build the static HTML dashboard."""

import json
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path

import numpy as np

from src.analysis.descriptive import describe
from src.analysis.randomness import run_all
from src.config import GAMES, OUTPUT_DIR, GameConfig, keno_game
from src.data.loader import load_draws
from src.models.prizes import ev_vs_jackpot, prize_tiers
from src.pipelines.backtest import run_backtest
from src.models.strategies import ALL_STRATEGIES
from src.models.unseen_pool import UnseenPoolStrategy
from src.pipelines.suggest import (
    keno_suggest,
    suggest_unseen_pool,
    value_summary,
)
from src.utils.log import get_logger

logger = get_logger(__name__)

WEB_DIR = Path(__file__).resolve().parent / "web"
TEMPLATE = WEB_DIR / "template.html"
# Concatenated in this order into the page (plain scripts, shared scope).
JS_FILES = (
    "core.js",
    "model.js",
    "popup.js",
    "analysis.js",
    "suggest.js",
    "search.js",
    "backtest.js",
    "info.js",
    "app.js",
)

# Backtest settings per game: (tickets per draw, max evaluated draws)
BACKTEST_SETTINGS = {
    "power655": (30, None),
    "power645": (30, None),
    "power535": (30, None),
    "keno": (10, 20_000),
}
KENO_BACKTEST_SPOT = 10
RECENT = {"power655": 100, "power645": 100, "power535": 100, "keno": 2000}


def _json_default(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(f"Not serialisable: {type(o)}")


def ev_curve(game: GameConfig, points: int = 60) -> dict:
    lo = game.prize(*game.jackpot_keys[0])
    js = np.linspace(lo, max(lo * 15, 400e9), points)
    return {"jackpot": js.tolist(), "rtp": ev_vs_jackpot(game, js).tolist()}


def analyse_game(key: str, n_suggest: int = 6, run_bt: bool = True) -> dict:
    game = GAMES[key]
    logger.info(f"=== {game.name} ===")
    draws = load_draws(game)
    out = describe(draws, RECENT[key])
    out["tests"] = run_all(draws)
    out["value"] = value_summary(game)

    bt_game = keno_game(KENO_BACKTEST_SPOT) if key == "keno" else game
    bt_draws = load_draws(bt_game) if key == "keno" else draws
    n_tickets, max_eval = BACKTEST_SETTINGS[key]
    if run_bt:
        strategies = ALL_STRATEGIES + ([] if key == "keno" else [UnseenPoolStrategy])
        results = run_backtest(
            bt_draws, n_tickets=n_tickets, max_eval=max_eval, strategies=strategies
        )
        out["backtest"] = {
            "game": bt_game.name,
            "results": [r.to_dict() for r in results],
        }
    if key == "keno":
        out["suggest"] = keno_suggest(n_suggest)
    else:
        out["unseen_pool"] = suggest_unseen_pool(draws, n=10)
        out["value"]["ev_curve"] = ev_curve(game)
        out["value"]["tiers"] = prize_tiers(game)
    return out


def build(games: list[str] | None = None, run_bt: bool = True) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    data = {
        "generated": datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).strftime(
            "%Y-%m-%d %H:%M (GMT+7)"
        ),
        "games": {k: analyse_game(k, run_bt=run_bt) for k in (games or GAMES)},
    }
    payload = json.dumps(data, default=_json_default, ensure_ascii=False)
    (OUTPUT_DIR / "analysis.json").write_text(payload, encoding="utf-8")
    return render_html(payload)


def render_html(payload: str | None = None) -> Path:
    """Render the dashboard; without payload, reuse outputs/analysis.json."""
    if payload is None:
        payload = (OUTPUT_DIR / "analysis.json").read_text(encoding="utf-8")
    js = "\n".join(
        (WEB_DIR / "js" / name).read_text(encoding="utf-8") for name in JS_FILES
    )
    html = (
        TEMPLATE.read_text(encoding="utf-8")
        .replace("/*__JS__*/", js)
        .replace("/*__DATA__*/null", payload)
    )
    path = OUTPUT_DIR / "dashboard.html"
    path.write_text(html, encoding="utf-8")
    logger.info(f"Dashboard written: {path} ({path.stat().st_size / 1e6:.2f} MB)")
    return path
