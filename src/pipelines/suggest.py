"""Ticket suggestions.

No selection method changes the probability of winning a fair draw, so the
suggester optimises what *can* be optimised:

1. Anti-popularity: prefer combinations other players rarely choose (avoid
   birthdays 1-31, lucky numbers, arithmetic patterns, copies of previous
   results). Probability is unchanged, but a jackpot win is less likely to
   be shared, which raises the expected payout of the jackpot tier.
2. Diversification: tickets in a set overlap as little as possible, so the
   set covers more numbers (same EV, lower chance of all tickets losing).
3. Optional strategy weighting, only meaningful if a strategy passed the
   backtest significance test (none did so far).

Keno has fixed prizes (no sharing), so only the spot level matters there.
"""

from dataclasses import dataclass
from math import comb

import numpy as np
from scipy.optimize import brentq

from src.config import SEED, GameConfig
from src.data.loader import Draws
from src.models.prizes import ev_vs_jackpot, keno_rtp_table, rtp
from src.models.strategies import Strategy, weighted_sample
from src.models.unseen_pool import UnseenPoolStrategy, mode_weights

LUCKY = {6, 8, 9, 39, 68, 79}  # common Vietnamese lucky numbers


@dataclass
class Suggestion:
    numbers: list[int]
    special: int | None
    popularity: float
    reasons: list[str]


def popularity(ticket: np.ndarray, game: GameConfig, last: set[int],
               history: set[tuple[int, ...]]) -> tuple[float, list[str]]:
    """Heuristic score: higher = more likely chosen by other players."""
    t = np.sort(ticket)
    score = 0.0
    reasons = []
    n_bday = int((t <= 31).sum())
    score += 0.6 * n_bday + 0.3 * int((t <= 12).sum())
    if n_bday == len(t):
        score += 2.0
        reasons.append("all <= 31 (birthday range)")
    n_lucky = len(LUCKY.intersection(t.tolist()))
    score += 0.5 * n_lucky
    d = np.diff(t)
    if len(set(d.tolist())) == 1:
        score += 6.0
        reasons.append("arithmetic progression")
    run = max(len(r) for r in np.split(t, np.flatnonzero(d != 1) + 1))
    if run >= 3:
        score += 1.5 * (run - 2)
        reasons.append(f"run of {run} consecutive")
    if len(set((t % 10).tolist())) <= 2:
        score += 2.0
        reasons.append("same last digit")
    if len(set(((t - 1) // 10).tolist())) == 1:
        score += 2.0
        reasons.append("single decade")
    if (t % 5 == 0).sum() >= 3:
        score += 1.0
        reasons.append("many multiples of 5")
    overlap_last = len(last.intersection(t.tolist()))
    if overlap_last >= 3:
        score += 2.0 * (overlap_last - 2)
        reasons.append(f"{overlap_last} numbers from last draw")
    if tuple(t.tolist()) in history:
        score += 5.0
        reasons.append("repeats a past result")
    span = int(t[-1] - t[0])
    if span < game.pool // 2:
        score += 1.5
        reasons.append(f"narrow span ({span})")
    return score, reasons


def suggest(
    draws: Draws,
    n: int = 5,
    max_overlap: int | None = None,
    strategy: Strategy | None = None,
    n_candidates: int = 50_000,
    seed: int | None = None,
) -> list[Suggestion]:
    game = draws.game
    rng = np.random.default_rng(SEED if seed is None else seed)
    if max_overlap is None:
        max_overlap = max(1, game.pick // 3)
    if strategy is not None:
        for row in draws.onehot:
            strategy.update(row)
        w = strategy.weights()
    else:
        w = np.full(game.pool, 1 / game.pool)
    cand = weighted_sample(rng, w, game.pick, n_candidates) + 1
    last = set(draws.main[-1].tolist())
    history = {tuple(r.tolist()) for r in draws.main}
    scored = [(popularity(c, game, last, history), c) for c in cand]
    scored.sort(key=lambda s: s[0][0])
    # Random pick among the least popular 5% (keeps variety across runs).
    pool = scored[: max(n * 50, n_candidates // 20)]
    order = rng.permutation(len(pool))

    chosen: list[Suggestion] = []
    for (score, reasons), c in (pool[i] for i in order):
        if any(len(set(c.tolist()) & set(s.numbers)) > max_overlap for s in chosen):
            continue
        sp = None
        if game.special == "separate":
            sp = int(rng.integers(1, game.special_pool + 1))
        chosen.append(Suggestion(c.tolist(), sp, round(score, 2), reasons))
        if len(chosen) == n:
            break
    return chosen


def keno_suggest(n: int = 5, spot: int | None = None, seed: int | None = None) -> dict:
    """Recommend the Keno spot level with the best RTP, numbers uniform."""
    table = keno_rtp_table()
    best = max(table, key=lambda r: r["rtp"])
    spot = spot or best["spot"]
    rng = np.random.default_rng(SEED if seed is None else seed)
    tickets = [
        sorted((rng.choice(80, spot, replace=False) + 1).tolist()) for _ in range(n)
    ]
    return {"spot": spot, "best": best, "rtp_table": table, "tickets": tickets}


def breakeven_jackpot(game: GameConfig) -> float | None:
    """Main-jackpot value where taxed RTP reaches 100% (no sharing)."""
    if not game.jackpot_keys:
        return None
    f = lambda j: float(ev_vs_jackpot(game, np.array([j]))[0]) - 1.0  # noqa: E731
    return brentq(f, 1e6, 1e14)


def value_summary(game: GameConfig) -> dict:
    if game.key == "keno":
        return {"rtp_table": keno_rtp_table()}
    return {
        "rtp_min_jackpot": rtp(game),
        "rtp_gross_min_jackpot": rtp(game, taxed=False),
        "breakeven_jackpot": breakeven_jackpot(game),
    }



def suggest_unseen_pool(draws: Draws, n: int = 10, seed: int | None = None) -> dict:
    """Never-drawn tickets filtered by sum/odd/low/spacing rules.

    Split 4 hot / 4 cold / 2 balanced for n=10 (see models.unseen_pool).
    """
    game = draws.game
    rng = np.random.default_rng(SEED if seed is None else seed)
    strat = UnseenPoolStrategy(game)
    for row in draws.onehot:
        strat.update(row)
    tickets = strat.tickets(rng, n)
    rules = strat.rules()

    if game.special == "separate":
        s = draws.special[draws.special > 0]
        counts = np.bincount(s, minlength=game.special_pool + 1)[1:]
        p = 1 / game.special_pool
        special_z = (counts - len(s) * p) / np.sqrt(len(s) * p * (1 - p))

    rows = []
    for t, mode in zip(tickets, strat.last_modes):
        sp = None
        if game.special == "separate":
            sp = int(rng.choice(game.special_pool, p=mode_weights(special_z, mode)))
            sp += 1
        rows.append(
            {"numbers": t.tolist(), "special": sp, "mode": mode, **strat.describe(t)}
        )
    return {
        "pool_size": comb(game.pool, game.pick) - len(strat.history),
        "excluded": len(strat.history),
        "rules": {
            "sum_lo": round(float(rules.sum_lo), 1),
            "sum_hi": round(float(rules.sum_hi), 1),
            "odd_ok": rules.odd_ok.tolist(),
            "low_ok": rules.low_ok.tolist(),
            "low_max": game.pool // 2,
            "max_gap": rules.max_gap,
            "max_adjacent": rules.max_adjacent,
        },
        "tickets": rows,
        # Inputs for the in-browser generator (dashboard, per-visitor sets).
        "client": {
            "pick": game.pick,
            "pool": game.pool,
            "special_pool": game.special_pool if game.special == "separate" else 0,
            "max_overlap": strat.max_overlap,
            "strength": strat.strength,
            "split": strat.split,
            "freq_z": [round(float(v), 4) for v in strat.frequency_z()],
            "special_z": (
                [round(float(v), 4) for v in special_z]
                if game.special == "separate"
                else None
            ),
            "sum_mean": round(float(strat.sum_mean), 3),
            "sum_sd": round(float(strat.sum_sd), 3),
            # Past combinations, numbers joined by "-" (exact-match exclusion).
            "history": sorted("-".join(map(str, c)) for c in strat.history),
        },
    }
