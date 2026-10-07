"""Unseen-pool strategy: never-drawn combinations filtered by distribution rules.

Pool  : every combination except those already drawn (exact match).
Rules : 1. Normal-distribution band on the ticket sum (central 80%).
        2. Odd count and low-number count within their most likely values
           (hypergeometric, central >= 80% of mass).
        3. Spacing between sorted numbers inside the ticket: largest gap and
           number of adjacent pairs within the historical 95th / 90th pct.
Weights: number frequency, one of three modes
        hot      - favour numbers drawn more than expected,
        cold     - favour numbers drawn less than expected,
        balanced - favour numbers close to expectation.
Tickets of one set are split across modes (default 40% hot, 40% cold,
20% balanced) and overlap at most ``max_overlap`` numbers.

As with every strategy, this cannot change the odds of a fair draw; the
walk-forward backtest measures it against random picking.
"""

from dataclasses import dataclass
from math import comb

import numpy as np
from scipy import stats

from src.config import GameConfig
from src.models.strategies import Strategy, weighted_sample

MODES = ("hot", "cold", "balanced")
DEFAULT_SPLIT = {"hot": 0.4, "cold": 0.4, "balanced": 0.2}


def mode_weights(z: np.ndarray, mode: str, strength: float = 1.0) -> np.ndarray:
    """Sampling weights from frequency z-scores."""
    if mode == "hot":
        w = np.exp(strength * z)
    elif mode == "cold":
        w = np.exp(-strength * z)
    elif mode == "balanced":
        w = np.exp(-0.5 * strength * z**2)
    else:
        raise ValueError(f"Unknown mode: {mode}")
    return w / w.sum()


def split_modes(n: int, split: dict[str, float] = DEFAULT_SPLIT) -> list[str]:
    """Allocate n tickets to modes by largest remainder (10 -> 4/4/2)."""
    raw = {m: n * f for m, f in split.items()}
    alloc = {m: int(v) for m, v in raw.items()}
    rest = sorted(raw, key=lambda m: raw[m] - alloc[m], reverse=True)
    for m in rest[: n - sum(alloc.values())]:
        alloc[m] += 1
    return [m for m in split for _ in range(alloc[m])]


def central_values(probs: np.ndarray, mass: float = 0.8) -> np.ndarray:
    """Smallest set of most likely values whose total probability >= mass."""
    order = np.argsort(-probs)
    k = int(np.searchsorted(np.cumsum(probs[order]), mass)) + 1
    return np.sort(order[:k])


@dataclass(frozen=True)
class ShapeRules:
    sum_lo: float
    sum_hi: float
    odd_ok: np.ndarray
    low_ok: np.ndarray
    max_gap: int
    max_adjacent: int


def theoretical_shape(game: GameConfig, sum_conf: float = 0.8) -> tuple:
    """Sum band and allowed odd/low counts under fair draws."""
    n_pool, k = game.pool, game.pick
    mean = k * (n_pool + 1) / 2
    sd = np.sqrt(k * (n_pool - k) * (n_pool + 1) / 12)
    zq = stats.norm.ppf(0.5 + sum_conf / 2)
    total = comb(n_pool, k)

    def hg(good: int) -> np.ndarray:
        return np.array(
            [comb(good, i) * comb(n_pool - good, k - i) / total for i in range(k + 1)]
        )

    odd_ok = central_values(hg((n_pool + 1) // 2))
    low_ok = central_values(hg(n_pool // 2))
    return mean - zq * sd, mean + zq * sd, odd_ok, low_ok, mean, sd


class UnseenPoolStrategy(Strategy):
    name = "Unseen pool"

    def __init__(
        self,
        game: GameConfig,
        split: dict[str, float] | None = None,
        recent: int | None = None,
        strength: float = 1.0,
        max_overlap: int | None = None,
        **kw,
    ):
        super().__init__(game, **kw)
        self.split = split or DEFAULT_SPLIT
        self.recent_n = recent or game.window
        self.strength = strength
        self.max_overlap = max_overlap if max_overlap is not None else game.pick // 2
        self.counts_all = np.zeros(game.pool)
        self.counts_recent = np.zeros(game.pool)
        self.history: set[tuple[int, ...]] = set()
        # per-draw spacing stats (indexed by value) for percentile rules
        self.max_gap_hist = np.zeros(game.pool + 1, dtype=np.int64)
        self.adj_hist = np.zeros(game.pick + 1, dtype=np.int64)
        lo, hi, odd_ok, low_ok, self.sum_mean, self.sum_sd = theoretical_shape(game)
        self._shape = (lo, hi, odd_ok, low_ok)
        self.last_modes: list[str] = []

    @property
    def params(self) -> dict:
        return {
            "split": self.split,
            "recent": self.recent_n,
            "strength": self.strength,
            "max_overlap": self.max_overlap,
        }

    # --- state -------------------------------------------------------------
    def update(self, x: np.ndarray) -> None:
        xf = x[1:].astype(np.float64)
        self.counts_all += xf
        self.recent.append(xf)
        self.counts_recent += xf
        if len(self.recent) > self.recent_n:
            self.counts_recent -= self.recent.popleft()
        nums = np.flatnonzero(x[1:]) + 1
        if len(nums) == self.game.pick:
            self.history.add(tuple(nums.tolist()))
        d = np.diff(nums)
        if len(d):
            self.max_gap_hist[d.max()] += 1
            self.adj_hist[min(int((d == 1).sum()), self.game.pick)] += 1
        self.t += 1

    # --- rules -------------------------------------------------------------
    @staticmethod
    def _percentile(hist: np.ndarray, q: float, default: int) -> int:
        total = hist.sum()
        if total < 30:
            return default
        return int(np.searchsorted(np.cumsum(hist), q * total))

    def rules(self) -> ShapeRules:
        lo, hi, odd_ok, low_ok = self._shape
        return ShapeRules(
            sum_lo=lo,
            sum_hi=hi,
            odd_ok=odd_ok,
            low_ok=low_ok,
            max_gap=self._percentile(self.max_gap_hist, 0.95, self.game.pool),
            max_adjacent=self._percentile(self.adj_hist, 0.90, self.game.pick),
        )

    def frequency_z(self) -> np.ndarray:
        """Average of all-time and recent frequency z-scores per number."""
        p = self.game.drawn / self.game.pool

        def z(counts: np.ndarray, n: int) -> np.ndarray:
            if n == 0:
                return np.zeros_like(counts)
            return (counts - n * p) / np.sqrt(n * p * (1 - p))

        return 0.5 * (z(self.counts_all, self.t) + z(self.counts_recent, len(self.recent)))

    def passes(self, tickets: np.ndarray, r: ShapeRules) -> np.ndarray:
        """Vectorised rule check for (n, pick) 1-based sorted tickets."""
        s = tickets.sum(axis=1)
        odd = (tickets % 2 == 1).sum(axis=1)
        low = (tickets <= self.game.pool // 2).sum(axis=1)
        d = np.diff(tickets, axis=1)
        return (
            (s >= r.sum_lo)
            & (s <= r.sum_hi)
            & np.isin(odd, r.odd_ok)
            & np.isin(low, r.low_ok)
            & (d.max(axis=1) <= r.max_gap)
            & ((d == 1).sum(axis=1) <= r.max_adjacent)
        )

    # --- prediction --------------------------------------------------------
    def tickets(self, rng: np.random.Generator, n: int) -> np.ndarray:
        r = self.rules()
        z = self.frequency_z()
        modes = split_modes(n, self.split)
        out: list[np.ndarray] = []
        for mode in modes:
            w = mode_weights(z, mode, self.strength)
            out.append(self._one(rng, w, r, out))
        self.last_modes = modes
        return np.array(out)

    def _one(
        self,
        rng: np.random.Generator,
        w: np.ndarray,
        r: ShapeRules,
        chosen: list[np.ndarray],
        batch: int = 256,
        max_rounds: int = 200,
    ) -> np.ndarray:
        overlap = self.max_overlap
        for i in range(max_rounds):
            cand = weighted_sample(rng, w, self.game.pick, batch) + 1
            for c in cand[self.passes(cand, r)]:
                if tuple(c.tolist()) in self.history:
                    continue
                if any(np.intersect1d(c, o).size > overlap for o in chosen):
                    continue
                return c
            if i == max_rounds // 2:
                overlap += 1  # relax diversification before giving up
        raise RuntimeError("No ticket satisfies the rules; relax constraints")

    def describe(self, ticket: np.ndarray) -> dict:
        """Diagnostics shown next to a suggested ticket."""
        z = self.frequency_z()
        d = np.diff(ticket)
        s = int(ticket.sum())
        return {
            "sum": s,
            "sum_z": round((s - self.sum_mean) / self.sum_sd, 2),
            "odd": int((ticket % 2 == 1).sum()),
            "low": int((ticket <= self.game.pool // 2).sum()),
            "gaps": d.tolist(),
            "freq_z": [round(float(z[v - 1]), 2) for v in ticket],
            "mean_freq_z": round(float(z[ticket - 1].mean()), 2),
            "in_history": tuple(ticket.tolist()) in self.history,
        }
