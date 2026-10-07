"""Walk-forward number-selection strategies.

Re-implementation of the 9 strategies in
vietlott-data/src/machine_learning/strategies, generalised to any game and
written as online models: ``update`` observes one draw, ``tickets`` samples
the next draw's tickets using only what was observed so far (no look-ahead).
Windows are expressed in draws, not days.
"""

from collections import deque

import numpy as np

from src.config import GameConfig


def weighted_sample(
    rng: np.random.Generator, weights: np.ndarray, k: int, n: int
) -> np.ndarray:
    """n samples of k distinct indices, without replacement, prop. to weights.

    Uses the Gumbel-top-k trick (equivalent to successive weighted draws).
    """
    with np.errstate(divide="ignore"):
        logw = np.log(weights)
    keys = logw[None, :] + rng.gumbel(size=(n, len(weights)))
    idx = np.argpartition(-keys, k - 1, axis=1)[:, :k]
    return np.sort(idx, axis=1)


class Strategy:
    name = "Base"

    def __init__(self, game: GameConfig, window: int | None = None, mix: float = 1.0):
        self.game = game
        self.window = window or game.window
        self.mix = mix  # share of weight from the model, rest uniform
        self.t = 0
        self.recent: deque[np.ndarray] = deque()

    @property
    def params(self) -> dict:
        return {"window": self.window, "mix": self.mix}

    # --- state -------------------------------------------------------------
    def update(self, x: np.ndarray) -> None:
        """Observe one draw (bool one-hot over 1..pool)."""
        x = x[1:].astype(np.float64)
        self.recent.append(x)
        self._add(x)
        if len(self.recent) > self.window:
            self._remove(self.recent.popleft())
        self.t += 1

    def _add(self, x: np.ndarray) -> None:
        pass

    def _remove(self, x: np.ndarray) -> None:
        pass

    # --- prediction --------------------------------------------------------
    def scores(self) -> np.ndarray:
        """Non-negative score per number (index 0 -> number 1)."""
        return np.ones(self.game.pool)

    def weights(self) -> np.ndarray:
        s = np.clip(self.scores(), 0, None)
        total = s.sum()
        s = s / total if total > 0 else np.full(self.game.pool, 1 / self.game.pool)
        return self.mix * s + (1 - self.mix) / self.game.pool

    def tickets(self, rng: np.random.Generator, n: int) -> np.ndarray:
        idx = weighted_sample(rng, self.weights(), self.game.pick, n)
        return (idx + 1).astype(np.int64)


class RandomStrategy(Strategy):
    name = "Random"

    @property
    def params(self) -> dict:
        return {}


class _WindowCount(Strategy):
    def __init__(self, game: GameConfig, **kw):
        super().__init__(game, **kw)
        self.counts = np.zeros(game.pool)

    def _add(self, x: np.ndarray) -> None:
        self.counts += x

    def _remove(self, x: np.ndarray) -> None:
        self.counts -= x


class HotStrategy(_WindowCount):
    name = "Hot numbers"

    def __init__(self, game: GameConfig, mix: float = 0.7, **kw):
        super().__init__(game, mix=mix, **kw)

    def scores(self) -> np.ndarray:
        return self.counts + 0.5


class ColdStrategy(_WindowCount):
    name = "Cold numbers"

    def __init__(self, game: GameConfig, mix: float = 0.7, **kw):
        super().__init__(game, mix=mix, **kw)

    def scores(self) -> np.ndarray:
        return self.counts.max() - self.counts + 0.5


class NotRepeatStrategy(_WindowCount):
    """Down-weight numbers seen in the last few draws."""

    name = "Not repeat"

    def __init__(
        self, game: GameConfig, window: int | None = None, avoid: float = 0.8, **kw
    ):
        # Default: about one full turnover of the pool (e.g. 9 draws for 6/55).
        super().__init__(game, window=window or game.pool // game.drawn, **kw)
        self.avoid = avoid

    @property
    def params(self) -> dict:
        return {"window": self.window, "avoid": self.avoid}

    def scores(self) -> np.ndarray:
        return np.where(self.counts > 0, 1 - self.avoid, 1.0)


class ExpDecayStrategy(Strategy):
    name = "Exponential decay"

    def __init__(
        self, game: GameConfig, half_life: float | None = None, mix: float = 0.8, **kw
    ):
        super().__init__(game, mix=mix, **kw)
        self.half_life = half_life or game.window / 2
        self.decay = 0.5 ** (1 / self.half_life)
        self.score = np.zeros(game.pool)

    @property
    def params(self) -> dict:
        return {"half_life": self.half_life, "mix": self.mix}

    def update(self, x: np.ndarray) -> None:
        self.score = self.score * self.decay + x[1:]
        self.t += 1

    def scores(self) -> np.ndarray:
        return self.score + 1e-3


class LongAbsenceStrategy(Strategy):
    """Pick uniformly among the `top_n` most overdue numbers."""

    name = "Long absence"

    def __init__(self, game: GameConfig, top_n: int | None = None, **kw):
        super().__init__(game, **kw)
        self.top_n = top_n or max(10, 2 * game.pick)
        self.last_seen = np.full(game.pool, -1)

    @property
    def params(self) -> dict:
        return {"top_n": self.top_n}

    def update(self, x: np.ndarray) -> None:
        self.last_seen[x[1:]] = self.t
        self.t += 1

    def scores(self) -> np.ndarray:
        gap = self.t - self.last_seen
        top = np.argsort(-gap, kind="stable")[: self.top_n]
        s = np.zeros(self.game.pool)
        s[top] = 1.0
        return s


class MarkovStrategy(Strategy):
    """First-order transitions: T[a, b] = #(a in draw t, b in draw t+1)."""

    name = "Markov chain"

    def __init__(self, game: GameConfig, smoothing: float = 0.5, **kw):
        super().__init__(game, **kw)
        self.smoothing = smoothing
        self.T = np.zeros((game.pool, game.pool))
        self.pairs: deque[tuple[np.ndarray, np.ndarray]] = deque()
        self.prev: np.ndarray | None = None

    @property
    def params(self) -> dict:
        return {"window": self.window, "smoothing": self.smoothing}

    def update(self, x: np.ndarray) -> None:
        cur = x[1:].astype(np.float64)
        if self.prev is not None:
            self.T += np.outer(self.prev, cur)
            self.pairs.append((self.prev, cur))
            if len(self.pairs) > self.window:
                a, b = self.pairs.popleft()
                self.T -= np.outer(a, b)
        self.prev = cur
        self.t += 1

    def scores(self) -> np.ndarray:
        if self.prev is None:
            return np.ones(self.game.pool)
        return self.prev @ self.T + self.smoothing


class PairFrequencyStrategy(Strategy):
    """Build tickets from numbers that co-occur within the same draw."""

    name = "Pair frequency"

    def __init__(self, game: GameConfig, **kw):
        super().__init__(game, **kw)
        self.C = np.zeros((game.pool, game.pool))

    def _add(self, x: np.ndarray) -> None:
        self.C += np.outer(x, x)

    def _remove(self, x: np.ndarray) -> None:
        self.C -= np.outer(x, x)

    def tickets(self, rng: np.random.Generator, n: int) -> np.ndarray:
        pool, k = self.game.pool, self.game.pick
        freq = np.diag(self.C) + 0.5
        off = self.C.copy()
        np.fill_diagonal(off, 0)
        out = np.empty((n, k), dtype=np.int64)
        for i in range(n):
            chosen = [rng.choice(pool, p=freq / freq.sum())]
            while len(chosen) < k:
                w = off[chosen].mean(axis=0) + 0.5
                w[chosen] = 0
                chosen.append(rng.choice(pool, p=w / w.sum()))
            out[i] = np.sort(chosen) + 1
        return out


class PatternStrategy(Strategy):
    """Sample tickets from empirical first-number and gap distributions."""

    name = "Pattern (gaps)"

    def __init__(self, game: GameConfig, **kw):
        super().__init__(game, **kw)
        self.first = np.zeros(game.pool + 1)
        self.gaps = np.zeros(game.pool + 1)

    @staticmethod
    def _parts(x: np.ndarray) -> tuple[int, np.ndarray]:
        nums = np.flatnonzero(x) + 1
        return nums[0], np.diff(nums)

    def _add(self, x: np.ndarray) -> None:
        f, g = self._parts(x)
        self.first[f] += 1
        np.add.at(self.gaps, g, 1)

    def _remove(self, x: np.ndarray) -> None:
        f, g = self._parts(x)
        self.first[f] -= 1
        np.subtract.at(self.gaps, g, 1)

    def tickets(self, rng: np.random.Generator, n: int) -> np.ndarray:
        pool, k = self.game.pool, self.game.pick
        pf = self.first + 1e-3
        pf[0] = 0
        pf /= pf.sum()
        pg = self.gaps + 1e-3
        pg[0] = 0
        pg /= pg.sum()
        out = np.empty((n, k), dtype=np.int64)
        for i in range(n):
            nums = [int(rng.choice(pool + 1, p=pf))]
            while len(nums) < k:
                nxt = nums[-1] + int(rng.choice(pool + 1, p=pg))
                if nxt > pool:  # overflow: fill remaining slots uniformly
                    rest = np.setdiff1d(np.arange(1, pool + 1), nums)
                    nums += list(rng.choice(rest, k - len(nums), replace=False))
                    break
                nums.append(nxt)
            out[i] = np.sort(nums)
        return out


ALL_STRATEGIES: list[type[Strategy]] = [
    RandomStrategy,
    HotStrategy,
    ColdStrategy,
    NotRepeatStrategy,
    ExpDecayStrategy,
    LongAbsenceStrategy,
    MarkovStrategy,
    PairFrequencyStrategy,
    PatternStrategy,
]
