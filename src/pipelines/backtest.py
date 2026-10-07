"""Walk-forward backtest of all strategies with significance testing.

Null hypothesis: the strategy is no better than picking uniformly at random,
i.e. mean main matches per ticket = pick * drawn / pool. Tickets within a
draw are correlated, so the test is a one-sample t-test on the per-draw mean
match count (draws are independent). Holm correction across strategies.
"""

import time
import zlib
from dataclasses import asdict, dataclass, field

import numpy as np
from scipy import stats

from src.config import SEED, TICKET_PRICE, GameConfig
from src.data.loader import Draws
from src.models.prizes import after_tax, hypergeom_pmf
from src.models.strategies import ALL_STRATEGIES, Strategy
from src.utils.log import get_logger

logger = get_logger(__name__)


@dataclass
class BacktestResult:
    strategy: str
    params: dict
    n_draws: int
    n_tickets: int
    date_from: str
    date_to: str
    mean_matches: float
    expected_matches: float
    lift_pct: float  # (observed / expected - 1) * 100
    lift_ci95: tuple[float, float]
    t_stat: float
    p_value: float
    p_holm: float = 1.0
    cost: int = 0
    gross_gain: int = 0
    taxed_gain: float = 0.0
    roi_gross_pct: float = 0.0
    roi_taxed_pct: float = 0.0
    jackpot_hits: int = 0
    match_dist: dict[int, int] = field(default_factory=dict)
    expected_dist: dict[int, float] = field(default_factory=dict)
    special_hits: int = 0
    cum_profit: list[float] = field(default_factory=list)  # sampled curve
    seconds: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


def prize_matrix(game: GameConfig) -> np.ndarray:
    """prize[m, s] lookup for vectorised scoring (s: 0/1 special hit)."""
    pm = np.zeros((game.pick + 1, 2), dtype=np.int64)
    for m in range(game.pick + 1):
        for s in (0, 1):
            pm[m, s] = game.prize(m, bool(s))
    return pm


def holm(pvals: list[float]) -> list[float]:
    order = np.argsort(pvals)
    n = len(pvals)
    adj = np.empty(n)
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (n - rank) * pvals[i]))
        adj[i] = running
    return adj.tolist()


def run_strategy(
    strategy: Strategy,
    draws: Draws,
    start: int,
    n_tickets: int,
    rng: np.random.Generator,
    curve_points: int = 300,
) -> BacktestResult:
    game = draws.game
    t0 = time.perf_counter()
    pm = prize_matrix(game)
    jackpot_values = [game.prize(*k) for k in game.jackpot_keys]
    taxed = np.vectorize(after_tax)(pm.astype(float))

    for i in range(start):
        strategy.update(draws.onehot[i])

    n_eval = len(draws) - start
    per_draw_mean = np.empty(n_eval)
    profit = np.empty(n_eval)
    dist = np.zeros(game.pick + 1, dtype=np.int64)
    gross = 0
    taxed_gain = 0.0
    jackpots = 0
    special_hits = 0
    for j, i in enumerate(range(start, len(draws))):
        tickets = strategy.tickets(rng, n_tickets)
        matches = draws.onehot[i][tickets].sum(axis=1)
        if game.special == "bonus" and draws.special[i] > 0:
            s_hit = (tickets == draws.special[i]).any(axis=1)
        elif game.special == "separate":
            t_special = rng.integers(1, game.special_pool + 1, size=n_tickets)
            s_hit = t_special == draws.special[i]
        else:
            s_hit = np.zeros(n_tickets, dtype=bool)
        s_idx = s_hit.astype(np.int64)
        payout = pm[matches, s_idx]
        gross += int(payout.sum())
        taxed_gain += float(taxed[matches, s_idx].sum())
        jackpots += int(np.isin(payout, jackpot_values).sum())
        special_hits += int(s_hit.sum())
        dist += np.bincount(matches, minlength=game.pick + 1)
        per_draw_mean[j] = matches.mean()
        profit[j] = payout.sum() - n_tickets * TICKET_PRICE
        strategy.update(draws.onehot[i])

    expected = game.pick * game.drawn / game.pool
    t_stat, p_val = stats.ttest_1samp(per_draw_mean, expected)
    half = 1.96 * per_draw_mean.std(ddof=1) / np.sqrt(n_eval) / expected * 100
    lift = (per_draw_mean.mean() / expected - 1) * 100
    cost = n_eval * n_tickets * TICKET_PRICE
    total = n_eval * n_tickets
    cum = np.cumsum(profit)
    step = max(1, n_eval // curve_points)
    return BacktestResult(
        strategy=strategy.name,
        params=strategy.params,
        n_draws=n_eval,
        n_tickets=n_tickets,
        date_from=str(draws.dates[start]),
        date_to=str(draws.dates[-1]),
        mean_matches=float(per_draw_mean.mean()),
        expected_matches=expected,
        lift_pct=float(lift),
        lift_ci95=(float(lift - half), float(lift + half)),
        t_stat=float(t_stat),
        p_value=float(p_val),
        cost=cost,
        gross_gain=gross,
        taxed_gain=taxed_gain,
        roi_gross_pct=(gross / cost - 1) * 100,
        roi_taxed_pct=(taxed_gain / cost - 1) * 100,
        jackpot_hits=jackpots,
        match_dist={m: int(c) for m, c in enumerate(dist)},
        expected_dist={
            m: total * hypergeom_pmf(game.pool, game.drawn, game.pick, m)
            for m in range(game.pick + 1)
        },
        special_hits=special_hits,
        cum_profit=cum[::step].tolist() + [float(cum[-1])],
        seconds=time.perf_counter() - t0,
    )


def run_backtest(
    draws: Draws,
    n_tickets: int = 10,
    warmup: int | None = None,
    max_eval: int | None = None,
    strategies: list[type[Strategy]] | None = None,
) -> list[BacktestResult]:
    """Backtest every strategy on the same evaluation period.

    warmup: draws used only to build state before scoring starts
            (default: the game's window).
    max_eval: cap on evaluated draws (most recent ones), for Keno.
    """
    game = draws.game
    warmup = game.window if warmup is None else warmup
    start = warmup
    if max_eval is not None:
        start = max(start, len(draws) - max_eval)
    results = []
    for cls in strategies or ALL_STRATEGIES:
        strat = cls(game)
        # Stable per-strategy seed so reruns are reproducible.
        rng = np.random.default_rng([SEED, zlib.crc32(cls.__name__.encode())])
        res = run_strategy(strat, draws, start, n_tickets, rng)
        logger.info(
            f"{game.name:>16} | {res.strategy:<18} lift={res.lift_pct:+6.2f}% "
            f"p={res.p_value:.3f} ROI(gross)={res.roi_gross_pct:+7.1f}% "
            f"[{res.seconds:.1f}s]"
        )
        results.append(res)
    for res, p in zip(results, holm([r.p_value for r in results])):
        res.p_holm = p
    return results
