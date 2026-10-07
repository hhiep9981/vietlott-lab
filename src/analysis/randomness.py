"""Statistical tests of the hypothesis "draws are uniform and independent".

Every test returns a dict {test, statistic, df, p_value, detail}. A small
p-value (after accounting for the number of tests) is evidence of bias that
a strategy could exploit; large p-values mean no detectable pattern.
"""

from math import comb

import numpy as np
from scipy import stats

from src.data.loader import Draws


def _result(test: str, stat: float, df: float | None, p: float, detail: str) -> dict:
    return {
        "test": test,
        "statistic": float(stat),
        "df": None if df is None else float(df),
        "p_value": float(p),
        "detail": detail,
    }


def frequency_test(draws: Draws) -> dict:
    """Chi-square on per-number counts, corrected for no-replacement draws.

    Within a draw, number indicators are negatively correlated, so the
    plain Pearson statistic is rescaled: X = sum (O-E)^2 / (n p (1-p) N/(N-1))
    which is ~ chi2(N-1) under the null.
    """
    g = draws.game
    n, N = len(draws), g.pool
    p = g.drawn / N
    counts = draws.onehot[:, 1:].sum(axis=0)
    var = n * p * (1 - p) * N / (N - 1)
    x = ((counts - n * p) ** 2).sum() / var
    return _result(
        "Number frequency (chi-square)",
        x,
        N - 1,
        stats.chi2.sf(x, N - 1),
        f"min={counts.min()} max={counts.max()} expected={n * p:.1f}",
    )


def special_frequency_test(draws: Draws) -> dict | None:
    """Chi-square on the special number (Power 6/55 bonus, Lotto 5/35 special)."""
    g = draws.game
    s = draws.special[draws.special > 0]
    if g.special is None or len(s) == 0:
        return None
    k = g.pool if g.special == "bonus" else g.special_pool
    counts = np.bincount(s, minlength=k + 1)[1:]
    res = stats.chisquare(counts)
    return _result(
        "Special number frequency (chi-square)",
        res.statistic,
        k - 1,
        res.pvalue,
        f"n={len(s)} min={counts.min()} max={counts.max()}",
    )


def repeat_test(draws: Draws) -> dict:
    """Numbers repeated from the previous draw vs hypergeometric expectation."""
    g = draws.game
    rep = (draws.onehot[1:, 1:] & draws.onehot[:-1, 1:]).sum(axis=1)
    hg = stats.hypergeom(g.pool, g.drawn, g.drawn)
    mean, var = hg.mean(), hg.var()
    z = (rep.mean() - mean) / np.sqrt(var / len(rep))
    return _result(
        "Repeats from previous draw (z-test)",
        z,
        None,
        2 * stats.norm.sf(abs(z)),
        f"observed mean={rep.mean():.4f} expected={mean:.4f}",
    )


def autocorrelation_test(draws: Draws, lags: tuple[int, ...] = (1, 2, 3)) -> dict:
    """Per-number lag-k autocorrelation of the hit indicator series.

    Under independence each r_k * sqrt(n) ~ N(0, 1); the sum of squares over
    numbers and lags is ~ chi2(N * len(lags)).
    """
    x = draws.onehot[:, 1:].astype(float)
    x = x - x.mean(axis=0)
    denom = (x**2).sum(axis=0)
    n = len(x)
    q = 0.0
    worst = (0.0, 0, 0)
    for k in lags:
        r = (x[k:] * x[:-k]).sum(axis=0) / denom
        z = r * np.sqrt(n)
        q += (z**2).sum()
        i = int(np.argmax(np.abs(z)))
        if abs(z[i]) > abs(worst[0]):
            worst = (float(z[i]), i + 1, k)
    df = x.shape[1] * len(lags)
    return _result(
        f"Autocorrelation lags {list(lags)} (chi-square)",
        q,
        df,
        stats.chi2.sf(q, df),
        f"largest |z|={abs(worst[0]):.2f} (number {worst[1]}, lag {worst[2]})",
    )


def gap_test(draws: Draws) -> dict:
    """Pooled gaps between appearances vs geometric(p = drawn/pool)."""
    g = draws.game
    p = g.drawn / g.pool
    gaps = all_gaps(draws)
    k_max = int(np.ceil(np.log(1e-3) / np.log(1 - p)))  # tail bucket ~0.1%
    obs = np.bincount(np.minimum(gaps, k_max), minlength=k_max + 1)[1:]
    ks = np.arange(1, k_max + 1)
    probs = (1 - p) ** (ks - 1) * p
    probs[-1] = (1 - p) ** (k_max - 1)  # tail: gap >= k_max
    exp = probs * len(gaps)
    x = ((obs - exp) ** 2 / exp).sum()
    df = k_max - 1
    return _result(
        "Gap distribution vs geometric (chi-square)",
        x,
        df,
        stats.chi2.sf(x, df),
        f"gaps={len(gaps)} mean={gaps.mean():.2f} expected={1 / p:.2f}",
    )


def simulate_onehot(
    rng: np.random.Generator, n: int, pool: int, drawn: int
) -> np.ndarray:
    """n fair draws as a (n, pool) bool matrix."""
    idx = np.argpartition(rng.random((n, pool)), drawn, axis=1)[:, :drawn]
    out = np.zeros((n, pool), dtype=bool)
    np.put_along_axis(out, idx, True, axis=1)
    return out


def _pair_stat(x: np.ndarray, exp: float) -> tuple[float, np.ndarray]:
    xf = x.astype(np.float32)
    c = (xf.T @ xf).astype(np.float64)
    counts = c[np.triu_indices(x.shape[1], 1)]
    return float(((counts - exp) ** 2 / exp).sum()), counts


def pair_dispersion_test(draws: Draws, n_sim: int = 200, seed: int = 0) -> dict:
    """Are some pairs drawn together more often than chance?

    Pearson-style dispersion of all pair counts. Pairs sharing a number are
    correlated, so the p-value comes from Monte-Carlo fair draws of the same
    size instead of a chi-square table.
    """
    g = draws.game
    n = len(draws)
    exp = n * g.drawn * (g.drawn - 1) / (g.pool * (g.pool - 1))
    x2, counts = _pair_stat(draws.onehot[:, 1:], exp)
    rng = np.random.default_rng(seed)
    sims = np.array(
        [
            _pair_stat(simulate_onehot(rng, n, g.pool, g.drawn), exp)[0]
            for _ in range(n_sim)
        ]
    )
    p = (1 + (sims >= x2).sum()) / (n_sim + 1)
    iu = np.triu_indices(g.pool, 1)
    i = int(np.argmax(counts))
    return _result(
        f"Pair co-occurrence dispersion (Monte-Carlo, {n_sim} sims)",
        x2,
        None,
        p,
        f"pairs={len(counts)} expected={exp:.1f} max={int(counts[i])} "
        f"({iu[0][i] + 1}-{iu[1][i] + 1}); null mean={sims.mean():.0f}",
    )


def sum_test(draws: Draws, n_sim: int = 200_000, seed: int = 0) -> dict:
    """KS test of draw sums against Monte-Carlo null distribution."""
    g = draws.game
    rng = np.random.default_rng(seed)
    sim = np.argsort(rng.random((n_sim, g.pool)), axis=1)[:, : g.drawn].sum(1)
    sim = sim + g.drawn
    obs = draws.main.sum(axis=1)
    res = stats.ks_2samp(obs, sim)
    return _result(
        "Sum of numbers (KS vs simulation)",
        res.statistic,
        None,
        res.pvalue,
        f"observed mean={obs.mean():.2f} expected={g.drawn * (g.pool + 1) / 2:.2f}",
    )


def parity_test(draws: Draws) -> dict:
    """Odd-count per draw vs hypergeometric distribution."""
    g = draws.game
    n_odd_pool = (g.pool + 1) // 2
    odd = (draws.main % 2 == 1).sum(axis=1)
    ks = np.arange(g.drawn + 1)
    probs = np.array(
        [
            comb(n_odd_pool, k) * comb(g.pool - n_odd_pool, g.drawn - k)
            for k in ks
        ],
        dtype=float,
    )
    probs /= comb(g.pool, g.drawn)
    obs = np.bincount(odd, minlength=g.drawn + 1)
    exp = probs * len(odd)
    keep = exp >= 5
    obs_k = np.append(obs[keep], obs[~keep].sum())
    exp_k = np.append(exp[keep], exp[~keep].sum())
    if exp_k[-1] == 0:
        obs_k, exp_k = obs_k[:-1], exp_k[:-1]
    x = ((obs_k - exp_k) ** 2 / exp_k).sum()
    df = len(obs_k) - 1
    return _result(
        "Odd/even split (chi-square)",
        x,
        df,
        stats.chi2.sf(x, df),
        f"mean odd={odd.mean():.3f} expected={g.drawn * n_odd_pool / g.pool:.3f}",
    )


def all_gaps(draws: Draws) -> np.ndarray:
    """Gaps (in draws) between consecutive appearances of each number."""
    out = []
    for j in range(1, draws.game.pool + 1):
        idx = np.flatnonzero(draws.onehot[:, j])
        if len(idx) > 1:
            out.append(np.diff(idx))
    return np.concatenate(out)


def run_all(draws: Draws) -> list[dict]:
    tests = [
        frequency_test(draws),
        special_frequency_test(draws),
        repeat_test(draws),
        autocorrelation_test(draws),
        gap_test(draws),
        pair_dispersion_test(draws),
        sum_test(draws),
        parity_test(draws),
    ]
    tests = [t for t in tests if t is not None]
    # Bonferroni across the battery of tests for this game.
    for t in tests:
        t["p_bonferroni"] = min(1.0, t["p_value"] * len(tests))
    return tests
