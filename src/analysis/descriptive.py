"""Descriptive statistics for the dashboard (JSON-serialisable output)."""

from itertools import combinations
from math import comb

import numpy as np

from src.analysis.randomness import all_gaps, simulate_onehot
from src.data.loader import Draws


def _hypergeom_counts(pool: int, good: int, drawn: int, n: int) -> list[float]:
    total = comb(pool, drawn)
    return [
        n * comb(good, k) * comb(pool - good, drawn - k) / total
        for k in range(drawn + 1)
    ]


def frequency(draws: Draws, recent: int) -> dict:
    g = draws.game
    all_counts = draws.onehot[:, 1:].sum(axis=0)
    rec = draws.tail(recent)
    rec_counts = rec.onehot[:, 1:].sum(axis=0)
    p = g.drawn / g.pool
    return {
        "numbers": list(range(1, g.pool + 1)),
        "all": all_counts.tolist(),
        "all_expected": len(draws) * p,
        "recent": rec_counts.tolist(),
        "recent_n": len(rec),
        "recent_expected": len(rec) * p,
        # z-score of recent count vs binomial expectation
        "recent_z": (
            (rec_counts - len(rec) * p) / np.sqrt(len(rec) * p * (1 - p))
        ).round(3).tolist(),
    }


def gaps(draws: Draws) -> dict:
    g = draws.game
    n = len(draws)
    p = g.drawn / g.pool
    current, mean_gap, max_gap = [], [], []
    for j in range(1, g.pool + 1):
        idx = np.flatnonzero(draws.onehot[:, j])
        current.append(int(n - 1 - idx[-1]) if len(idx) else n)
        d = np.diff(idx)
        mean_gap.append(round(float(d.mean()), 2) if len(d) else None)
        max_gap.append(int(d.max()) if len(d) else None)
    pooled = all_gaps(draws)
    k_max = int(np.percentile(pooled, 99.5))
    hist = np.bincount(np.minimum(pooled, k_max), minlength=k_max + 1)[1:]
    ks = np.arange(1, k_max + 1)
    exp = len(pooled) * (1 - p) ** (ks - 1) * p
    exp[-1] = len(pooled) * (1 - p) ** (k_max - 1)
    return {
        "current": current,
        "mean": mean_gap,
        "max": max_gap,
        "expected_mean": 1 / p,
        # P(a given number is absent for >= current draws) under fairness
        "p_absent": [round((1 - p) ** c, 5) for c in current],
        "hist_k": ks.tolist(),
        "hist_obs": hist.tolist(),
        "hist_exp": exp.round(1).tolist(),
    }


def pairs(draws: Draws, top: int = 25) -> dict:
    g = draws.game
    x = draws.onehot[:, 1:].astype(np.float32)
    c = (x.T @ x).astype(np.int64)
    exp = len(draws) * g.drawn * (g.drawn - 1) / (g.pool * (g.pool - 1))
    iu = np.triu_indices(g.pool, 1)
    counts = c[iu]
    order = np.argsort(-counts)
    top_rows = [
        {"a": int(iu[0][i] + 1), "b": int(iu[1][i] + 1), "count": int(counts[i])}
        for i in order[:top]
    ]
    bottom_rows = [
        {"a": int(iu[0][i] + 1), "b": int(iu[1][i] + 1), "count": int(counts[i])}
        for i in order[::-1][:top]
    ]
    m = c.astype(float)
    np.fill_diagonal(m, np.nan)
    ratio = np.round(m / exp, 3)
    return {
        "expected": exp,
        "top": top_rows,
        "bottom": bottom_rows,
        # pool x pool matrix of observed/expected (diagonal null)
        "ratio": [[None if np.isnan(v) else float(v) for v in row] for row in ratio],
    }


def triplets(draws: Draws, top: int = 20) -> dict | None:
    g = draws.game
    if g.drawn > 7:  # Keno: 1140 triplets per draw, skip
        return None
    counter: dict[tuple[int, ...], int] = {}
    for row in draws.main:
        for t in combinations(row.tolist(), 3):
            counter[t] = counter.get(t, 0) + 1
    exp = len(draws) * comb(g.drawn, 3) / comb(g.pool, 3)
    best = sorted(counter.items(), key=lambda kv: -kv[1])[:top]
    return {
        "expected": exp,
        "top": [{"combo": list(k), "count": v} for k, v in best],
    }


def structure(draws: Draws, n_sim: int = 100_000, seed: int = 0) -> dict:
    """Per-draw shape: sum, odd count, low count, consecutive pairs, repeats."""
    g = draws.game
    n = len(draws)
    rng = np.random.default_rng(seed)
    sim = simulate_onehot(rng, n_sim, g.pool, g.drawn)
    nums = np.arange(1, g.pool + 1)

    def shape(onehot: np.ndarray) -> dict[str, np.ndarray]:
        oh = onehot.astype(np.int32)
        return {
            "sum": oh @ nums,
            "odd": oh @ (nums % 2),
            "low": oh @ (nums <= g.pool // 2).astype(np.int32),
            "consec": (onehot[:, 1:] & onehot[:, :-1]).sum(axis=1),
        }

    obs = shape(draws.onehot[:, 1:])
    null = shape(sim)
    out: dict = {}
    for key in ("odd", "low", "consec"):
        hi = int(max(obs[key].max(), null[key].max()))
        o = np.bincount(obs[key], minlength=hi + 1)
        e = np.bincount(null[key], minlength=hi + 1) * n / n_sim
        out[key] = {"k": list(range(hi + 1)), "obs": o.tolist(), "exp": e.round(1).tolist()}
    # sum histogram with shared bins
    lo = int(min(obs["sum"].min(), np.percentile(null["sum"], 0.05)))
    hi = int(max(obs["sum"].max(), np.percentile(null["sum"], 99.95)))
    width = max(1, (hi - lo) // 40)
    bins = np.arange(lo, hi + width + 1, width)
    o, _ = np.histogram(obs["sum"], bins)
    e, _ = np.histogram(null["sum"], bins)
    out["sum"] = {
        "bins": bins[:-1].tolist(),
        "width": width,
        "obs": o.tolist(),
        "exp": (e * n / n_sim).round(1).tolist(),
        "p10": float(np.percentile(null["sum"], 10)),
        "p90": float(np.percentile(null["sum"], 90)),
    }
    rep = (draws.onehot[1:, 1:] & draws.onehot[:-1, 1:]).sum(axis=1)
    out["repeat"] = {
        "k": list(range(g.drawn + 1)),
        "obs": np.bincount(rep, minlength=g.drawn + 1).tolist(),
        "exp": [round(v, 1) for v in _hypergeom_counts(g.pool, g.drawn, g.drawn, n - 1)],
    }
    out["buckets"] = buckets(draws, 10)
    out["buckets5"] = buckets(draws, 5)
    return out


def buckets(draws: Draws, size: int) -> dict:
    """Counts per range of `size` numbers (1-10, 11-20, ...) vs expectation."""
    g = draws.game
    n = len(draws)
    edges = list(range(0, g.pool, size))
    labels = [f"{a + 1}-{min(a + size, g.pool)}" for a in edges]
    cnt = [int(draws.onehot[:, a + 1 : min(a + size, g.pool) + 1].sum()) for a in edges]
    exp = [n * g.drawn * (min(a + size, g.pool) - a) / g.pool for a in edges]
    return {"size": size, "labels": labels, "obs": cnt, "exp": [round(v, 1) for v in exp]}


def _wait_stats(events: np.ndarray, p: float, label: str) -> dict:
    """Waiting time (in draws) between draws where a boolean event occurs."""
    idx = np.flatnonzero(events)
    waits = np.diff(idx)
    k_max = max(2, int(np.ceil(np.log(1e-3) / np.log(1 - p)))) if p < 1 else 2
    hist = np.bincount(np.minimum(waits, k_max), minlength=k_max + 1)[1:]
    ks = np.arange(1, k_max + 1)
    exp = len(waits) * (1 - p) ** (ks - 1) * p
    exp[-1] = len(waits) * (1 - p) ** (k_max - 1)
    return {
        "label": label,
        "p_theory": p,
        "p_obs": float(events.mean()),
        "n_events": int(len(idx)),
        "mean_wait_theory": 1 / p,
        "mean_wait_obs": float(waits.mean()) if len(waits) else None,
        "max_wait": int(waits.max()) if len(waits) else None,
        "current": int(len(events) - 1 - idx[-1]) if len(idx) else len(events),
        "hist_k": ks.tolist(),
        "hist_obs": hist.tolist(),
        "hist_exp": exp.round(1).tolist(),
    }


def waiting_times(draws: Draws) -> dict | None:
    """How long until a draw has (a) >=1 adjacent pair, (b) >=1 repeat.

    Exact per-draw probabilities: k-subsets of 1..N with no two consecutive
    numbers number C(N-k+1, k); no overlap with the previous draw has
    probability C(N-k, k) / C(N, k).
    """
    g = draws.game
    if g.key == "keno":
        return None
    n_pool, k = g.pool, g.drawn
    oh = draws.onehot[:, 1:]
    adj = (oh[:, 1:] & oh[:, :-1]).any(axis=1)
    rep = np.concatenate([[False], (oh[1:] & oh[:-1]).any(axis=1)])
    p_adj = 1 - comb(n_pool - k + 1, k) / comb(n_pool, k)
    p_rep = 1 - comb(n_pool - k, k) / comb(n_pool, k)
    return {
        "adjacent": _wait_stats(adj, p_adj, "Có ít nhất 1 cặp số liền nhau"),
        "repeat": _wait_stats(rep[1:], p_rep, "Có ít nhất 1 số lặp từ kỳ trước"),
    }


def history(draws: Draws) -> dict | None:
    """Compact full history for in-browser search, popup and backtest."""
    if draws.game.key == "keno":
        return None
    return {
        "dates": draws.dates.tolist(),
        "ids": draws.ids.tolist(),
        "main": draws.main.tolist(),
        "special": draws.special.tolist(),
    }


def period_heatmap(draws: Draws) -> dict:
    """Number x period frequency, as % deviation from expectation."""
    g = draws.game
    if g.key == "keno":
        periods = np.array([f"{d[:4]}-Q{(int(d[5:7]) - 1) // 3 + 1}" for d in draws.dates])
    else:
        periods = np.array([d[:4] for d in draws.dates])
    labels = sorted(set(periods.tolist()))
    # Drop partial periods (e.g. current quarter) that would look extreme.
    sizes = {lab: int((periods == lab).sum()) for lab in labels}
    median = float(np.median(list(sizes.values())))
    labels = [lab for lab in labels if sizes[lab] >= 0.5 * median]
    p = g.drawn / g.pool
    cells = []
    n_per = []
    for ci, lab in enumerate(labels):
        mask = periods == lab
        n_p = int(mask.sum())
        n_per.append(n_p)
        counts = draws.onehot[mask, 1:].sum(axis=0)
        exp = n_p * p
        for j, c in enumerate(counts):
            cells.append([ci, j, round(float((c - exp) / exp * 100), 1), int(c)])
    return {"periods": labels, "draws_per_period": n_per, "cells": cells}


def special(draws: Draws, recent: int = 100) -> dict | None:
    g = draws.game
    if g.special is None:
        return None
    s = draws.special[draws.special > 0]
    k = g.pool if g.special == "bonus" else g.special_pool
    counts = np.bincount(s, minlength=k + 1)[1:]
    r = s[-recent:]
    return {
        "label": "Bonus number" if g.special == "bonus" else "Special number (1-12)",
        "numbers": list(range(1, k + 1)),
        "counts": counts.tolist(),
        "expected": len(s) / k,
        "recent_n": len(r),
        "counts_recent": np.bincount(r, minlength=k + 1)[1:].tolist(),
        "expected_recent": len(r) / k,
    }


def recent_draws(draws: Draws, n: int = 30) -> list[dict]:
    t = draws.tail(n)
    rows = []
    for i in range(len(t) - 1, -1, -1):
        rows.append(
            {
                "date": str(t.dates[i]),
                "id": int(t.ids[i]),
                "main": t.main[i].tolist(),
                "special": int(t.special[i]) if t.special[i] > 0 else None,
            }
        )
    return rows


def keno_sides(draws: Draws) -> dict:
    """Keno side bets: big (41-80) count and even count per draw."""
    big = draws.onehot[:, 41:].sum(axis=1)
    even = draws.onehot[:, 2::2].sum(axis=1)
    exp = _hypergeom_counts(80, 40, 20, len(draws))
    return {
        "k": list(range(21)),
        "big": np.bincount(big, minlength=21).tolist(),
        "even": np.bincount(even, minlength=21).tolist(),
        "exp": [round(v, 1) for v in exp],
    }


def describe(draws: Draws, recent: int) -> dict:
    g = draws.game
    out = {
        "meta": {
            "key": g.key,
            "name": g.name,
            "pool": g.pool,
            "drawn": g.drawn,
            "n_draws": len(draws),
            "date_from": str(draws.dates[0]),
            "date_to": str(draws.dates[-1]),
            "first_id": int(draws.ids[0]),
            "last_id": int(draws.ids[-1]),
        },
        "frequency": frequency(draws, recent),
        "gaps": gaps(draws),
        "pairs": pairs(draws),
        "triplets": triplets(draws),
        "structure": structure(draws),
        "heatmap": period_heatmap(draws),
        "special": special(draws),
        "recent_draws": recent_draws(draws),
        "waiting": waiting_times(draws),
        "history": history(draws),
    }
    if g.key == "keno":
        out["keno_sides"] = keno_sides(draws)
    return out
