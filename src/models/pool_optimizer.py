"""Walk-forward optimised number pool.

Each draw t, every number gets a score = features(draws < t) @ weights; the
pool is the K highest-scoring numbers.

K is chosen by a nested rule (`select_k`): inside a training window, weights
per K are fit on the first INNER_FRAC and K is picked by validation z on the
rest; weights are then refit on the whole window. The rule is judged on a
70/30 hold-out, on N_FOLDS rolling outer folds (nested walk-forward), and
applied to all draws for the next-draw pool.

The browser re-implements `pool_features` (web/js/pool.js) for the
interactive backtest; tests check both give the same pool.
"""

from dataclasses import dataclass
from math import comb

import numpy as np
from scipy import stats

from src.config import SEED, TICKET_PRICE
from src.data.loader import Draws

FEATURES = (
    "freq_all",
    "freq_10",
    "freq_30",
    "freq_100",
    "absence",
    "last",
    "pair",
    "markov1",
    "markov2",
)
WINDOWS = (10, 30, 100)
WARMUP = 100
TRAIN_FRAC = 0.7
INNER_FRAC = 0.7  # any training window: fit w on this share, validate K on rest
N_FOLDS = 6
OUTER_START = 0.4  # outer folds cover the last 60% of evaluated draws
N_RANDOM_WEIGHTS = 500
CHUNK = 50
# Pool sizes searched (Vietlott "bao" levels for 6/x; 6..15 for 5/35)
K_GRID = {6: tuple(range(7, 19)), 5: tuple(range(6, 16))}


def _standardise(f: np.ndarray) -> np.ndarray:
    """Cross-sectional z per row (draw); constant rows -> 0."""
    mu = f.mean(axis=1, keepdims=True)
    sd = f.std(axis=1, keepdims=True)
    return np.divide(f - mu, sd, out=np.zeros_like(f), where=sd > 0)


def pool_features(onehot: np.ndarray) -> np.ndarray:
    """(T+1, N, F) features; row t uses only draws < t (row T = next draw)."""
    x = onehot.astype(np.float64)
    T, N = x.shape
    cum = np.vstack([np.zeros(N), np.cumsum(x, axis=0)])
    idx = np.arange(T + 1)
    raw = [cum]
    for w in WINDOWS:
        raw.append(cum - cum[np.maximum(idx - w, 0)])
    absence = np.zeros((T + 1, N))
    pair = np.zeros((T + 1, N))
    mk1 = np.zeros((T + 1, N))
    mk2 = np.zeros((T + 1, N))
    co = np.zeros((N, N))
    # tr[l][j, i]: times i was drawn l draws after j (transitions seen so far)
    tr = {1: np.zeros((N, N)), 2: np.zeros((N, N))}
    for t in range(1, T + 1):
        prev = x[t - 1]
        absence[t] = np.where(prev > 0, 0.0, absence[t - 1] + 1)
        # co-occurrence with last draw's numbers, counted on draws before it
        pair[t] = co @ prev
        co += np.outer(prev, prev)
        np.fill_diagonal(co, 0.0)
        # Markov: transitions ending at draw t-1 are known before draw t
        for lag, out in ((1, mk1), (2, mk2)):
            if t - 1 - lag >= 0:
                tr[lag] += np.outer(x[t - 1 - lag], prev)
            if t - lag >= 0:
                out[t] = x[t - lag] @ tr[lag]
    last = np.vstack([np.zeros(N), x])
    raw += [absence, last, pair, mk1, mk2]
    return np.stack([_standardise(f) for f in raw], axis=2)


def hits_by_rank(
    X: np.ndarray, target: np.ndarray, W: np.ndarray
) -> np.ndarray:
    """(n, M, N) winning numbers among the top-r scores, r = 1..N.

    X: (n, N, F) features, target: (n, N) one-hot results, W: (F, M).
    Ties break towards the smaller number (stable sort).
    """
    out = []
    for s in range(0, W.shape[1], CHUNK):
        sc = np.einsum("tnf,fm->tmn", X, W[:, s : s + CHUNK])
        order = np.argsort(-sc, axis=2, kind="stable")
        hit = np.take_along_axis(target[:, None, :], order, axis=2)
        out.append(np.cumsum(hit, axis=2, dtype=np.int16))
    return np.concatenate(out, axis=1)


def candidate_weights(seed: int = SEED, n: int = N_RANDOM_WEIGHTS) -> np.ndarray:
    """(F, M): +-each single feature, then random unit directions."""
    F = len(FEATURES)
    single = np.hstack([np.eye(F), -np.eye(F)])
    rnd = np.random.default_rng(seed).normal(size=(F, n))
    rnd /= np.linalg.norm(rnd, axis=0, keepdims=True)
    return np.hstack([single, rnd])


def _null(pool: int, drawn: int, k: int) -> tuple[float, float]:
    """Mean and sd of hits for a random pool of k numbers (hypergeometric)."""
    p = drawn / pool
    return k * p, float(np.sqrt(k * p * (1 - p) * (pool - k) / (pool - 1)))


@dataclass
class PoolStats:
    mean: float
    expected: float
    lift_pct: float
    ci95: tuple[float, float]
    p_value: float
    n: int

    def to_dict(self) -> dict:
        return {
            "mean": self.mean,
            "expected": self.expected,
            "lift_pct": self.lift_pct,
            "ci95": list(self.ci95),
            "p_value": self.p_value,
            "n": self.n,
        }


def pool_stats(hits: np.ndarray, expected: float) -> PoolStats:
    """Lift of mean hits per draw vs a random pool, with t-test and CI."""
    n = len(hits)
    mean = float(hits.mean())
    se = float(hits.std(ddof=1) / np.sqrt(n)) if n > 1 else float("nan")
    p = float(stats.ttest_1samp(hits, expected).pvalue) if se > 0 else 1.0
    lift = lambda v: (v / expected - 1) * 100  # noqa: E731
    return PoolStats(
        mean, expected, lift(mean), (lift(mean - 1.96 * se), lift(mean + 1.96 * se)),
        p, n,
    )


def _verdict(s: PoolStats) -> str:
    if s.ci95[0] > 0:
        return "better"
    if s.ci95[1] < 0:
        return "worse"
    return "same"


def _z(h: np.ndarray, e: np.ndarray, sd: np.ndarray) -> np.ndarray:
    """z of mean hits vs the random-pool null; h: (n, ...) with K last."""
    return (h.mean(axis=0) - e) / (sd / np.sqrt(len(h)))


def select_k(
    hits: np.ndarray, idx: np.ndarray, e: np.ndarray, sd: np.ndarray
) -> tuple[int, int, np.ndarray]:
    """Nested choice on training rows ``idx`` -> (weight m, K index j, val z).

    hits: (n, M, nK). Weights per K fit (max z) on the first INNER_FRAC of
    idx, K = max validation z on the rest, weights refit on all of idx.
    """
    cut = int(INNER_FRAC * len(idx))
    fit, val = idx[:cut], idx[cut:]
    best = _z(hits[fit], e, sd).argmax(axis=0)  # (nK,)
    cols = np.arange(len(e))
    z_val = _z(hits[val][:, best, cols], e, sd)  # (nK,)
    j = int(np.argmax(z_val))
    m = int(np.argmax(_z(hits[idx], e, sd)[:, j]))
    return m, j, z_val


def _excess_stats(h: np.ndarray, exp: np.ndarray) -> dict:
    """Lift of pooled hits whose expectation varies per draw (different K)."""
    x = h - exp
    se = x.std(ddof=1) / np.sqrt(len(x))
    lift = lambda v: v / exp.mean() * 100  # noqa: E731
    return {
        "lift_pct": float(lift(x.mean())),
        "ci95": [float(lift(x.mean() - 1.96 * se)), float(lift(x.mean() + 1.96 * se))],
        "p_value": float(stats.ttest_1samp(x, 0.0).pvalue) if se > 0 else 1.0,
        "n": int(len(x)),
    }


def nested_folds(
    hits: np.ndarray, e: np.ndarray, sd: np.ndarray, ks: np.ndarray, dates
) -> dict:
    """Rolling-origin outer folds: choose K with `select_k` on draws before
    each block, score the block. Also each K's out-of-sample curve."""
    n = len(hits)
    bounds = np.linspace(int(OUTER_START * n), n, N_FOLDS + 1).astype(int)
    folds, h_all, e_all = [], [], []
    per_k: list[list[np.ndarray]] = [[] for _ in ks]
    cols = np.arange(len(ks))
    for a, b in zip(bounds[:-1], bounds[1:]):
        train, test = np.arange(a), np.arange(a, b)
        m, j, z_val = select_k(hits, train, e, sd)
        h = hits[test, m, j]
        folds.append(
            {
                "from": str(dates[a]),
                "to": str(dates[b - 1]),
                "k": int(ks[j]),
                "val_z": z_val.round(3).tolist(),
                "test": pool_stats(h, e[j]).to_dict(),
            }
        )
        h_all.append(h)
        e_all.append(np.full(len(h), e[j]))
        best = _z(hits[train], e, sd).argmax(axis=0)
        for jj, hk in enumerate(hits[test][:, best, cols].T):
            per_k[jj].append(hk)
    return {
        "n_folds": N_FOLDS,
        "start_date": str(dates[bounds[0]]),
        "folds": folds,
        "pooled": _excess_stats(np.concatenate(h_all), np.concatenate(e_all)),
        "per_k": [
            dict(k=int(k), **pool_stats(np.concatenate(per_k[j]), e[j]).to_dict())
            for j, k in enumerate(ks)
        ],
    }


def optimise_pool(
    draws: Draws,
    k_grid: tuple[int, ...] | None = None,
    seed: int = SEED,
    n_weights: int = N_RANDOM_WEIGHTS,
) -> dict:
    """Nested (K, weights) choice: hold-out + rolling folds + next-draw pool."""
    g = draws.game
    oh = draws.onehot[:, 1:]  # column 0 unused
    T, N = oh.shape
    ks = np.array(k_grid or K_GRID[g.drawn])
    X = pool_features(oh)
    W = candidate_weights(seed, n_weights)
    rows = np.arange(WARMUP, T)
    n = len(rows)
    split = WARMUP + int(TRAIN_FRAC * n)
    hits = hits_by_rank(X[rows], oh[rows], W)[:, :, ks - 1]  # (n, M, nK)
    tr, te = np.arange(split - WARMUP), np.arange(split - WARMUP, n)
    null = [_null(N, g.drawn, int(k)) for k in ks]
    e = np.array([m for m, _ in null])
    sd = np.array([s for _, s in null])

    m_best, j_best, z_val = select_k(hits, tr, e, sd)
    z_tr = _z(hits[tr], e, sd)
    table = []
    for j, k in enumerate(ks):
        m = int(np.argmax(z_tr[:, j]))
        table.append(
            {
                "k": int(k),
                "weights": W[:, m].round(4).tolist(),
                "train_z": float(z_tr[m, j]),
                "val_z": float(z_val[j]),
                "train": pool_stats(hits[tr, m, j], e[j]).to_dict(),
                "test": pool_stats(hits[te, m, j], e[j]).to_dict(),
            }
        )
    k_best = int(ks[j_best])
    s_test = pool_stats(hits[te, m_best, j_best], e[j_best])

    # same rule on all evaluated draws for the next-draw pool
    m_fin, j_fin, z_fin = select_k(hits, np.arange(n), e, sd)
    k_fin = int(ks[j_fin])
    w_fin = W[:, m_fin]
    scores = X[T] @ w_fin
    order = np.argsort(-scores, kind="stable")
    pool = np.sort(order[:k_fin] + 1)

    obs = np.bincount(hits[te, m_best, j_best], minlength=g.drawn + 1)
    exp_dist = [
        len(te) * comb(g.drawn, h) * comb(N - g.drawn, k_best - h) / comb(N, k_best)
        for h in range(g.drawn + 1)
    ]
    return {
        "features": list(FEATURES),
        "k_grid": ks.tolist(),
        "warmup": WARMUP,
        "split_index": int(split - WARMUP),
        "split_date": str(draws.dates[split]),
        "n_weights": int(W.shape[1]),
        "table": table,
        "chosen": {
            "k": k_best,
            "weights": W[:, m_best].round(4).tolist(),
            "test": s_test.to_dict(),
            "verdict": _verdict(s_test),
        },
        "nested": nested_folds(hits, e, sd, ks, draws.dates[WARMUP:]),
        "final": {
            "k": k_fin,
            "val_z": z_fin.round(3).tolist(),
            "weights": w_fin.round(4).tolist(),
            "pool": pool.tolist(),
            "scores": scores.round(4).tolist(),
            "features": X[T].round(3).tolist(),
            "combos": comb(k_fin, g.pick),
            "cost": comb(k_fin, g.pick) * TICKET_PRICE,
            "after_date": str(draws.dates[-1]),
            "after_id": int(draws.ids[-1]),
        },
        "series": {
            "dates": [str(d) for d in draws.dates[WARMUP:]],
            "hits": hits[:, m_best, j_best].tolist(),
            "expected": float(e[j_best]),
        },
        "dist_test": {"obs": obs.tolist(), "exp": exp_dist},
    }
