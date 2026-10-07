"""Exact odds, expected value and ticket scoring for each game."""

from math import comb

import numpy as np

from src.config import (
    KENO_PRIZES,
    TAX_RATE,
    TAX_THRESHOLD,
    TICKET_PRICE,
    GameConfig,
    keno_game,
)


def after_tax(prize: float) -> float:
    if prize <= TAX_THRESHOLD:
        return prize
    return prize - (prize - TAX_THRESHOLD) * TAX_RATE


def hypergeom_pmf(pool: int, drawn: int, pick: int, m: int) -> float:
    """P(exactly m of `pick` ticket numbers are among `drawn` of `pool`)."""
    if m < 0 or m > pick or m > drawn or pick - m > pool - drawn:
        return 0.0
    return comb(drawn, m) * comb(pool - drawn, pick - m) / comb(pool, pick)


def outcome_probabilities(game: GameConfig) -> dict[tuple[int, bool], float]:
    """Probability of every (main_matches, special_hit) outcome for one ticket."""
    out: dict[tuple[int, bool], float] = {}
    for m in range(game.pick + 1):
        p_m = hypergeom_pmf(game.pool, game.drawn, game.pick, m)
        if game.special == "bonus":
            # Bonus is drawn from the numbers left after the main draw.
            p_hit = (game.pick - m) / (game.pool - game.drawn)
        elif game.special == "separate":
            p_hit = 1 / game.special_pool
        else:
            p_hit = 0.0
        out[(m, True)] = p_m * p_hit
        out[(m, False)] = p_m * (1 - p_hit)
    return out


def prize_tiers(game: GameConfig) -> list[dict]:
    """Winning tiers as in the official table, with exact probabilities."""
    agg: dict[tuple[int, bool | None], float] = {}
    for (m, s), p in outcome_probabilities(game).items():
        key = (m, s) if (m, s) in game.prizes else (m, None)
        if game.prizes.get(key, 0) > 0 and p > 0:
            agg[key] = agg.get(key, 0.0) + p
    rows = [
        {"matches": m, "special": s, "prob": p, "odds": 1 / p, "prize": game.prizes[(m, s)]}
        for (m, s), p in agg.items()
    ]
    return sorted(rows, key=lambda r: (-r["prize"], -r["matches"]))


def expected_return(game: GameConfig, taxed: bool = True) -> float:
    """Expected payout per ticket in VND (no jackpot sharing)."""
    ev = 0.0
    for (m, s), p in outcome_probabilities(game).items():
        prize = game.prize(m, s)
        ev += p * (after_tax(prize) if taxed else prize)
    return ev


def rtp(game: GameConfig, taxed: bool = True) -> float:
    """Return-to-player: expected payout / ticket price."""
    return expected_return(game, taxed) / TICKET_PRICE


def keno_rtp_table(taxed: bool = True) -> list[dict]:
    rows = []
    for spot in sorted(KENO_PRIZES):
        g = keno_game(spot)
        p_win = sum(
            p for (m, s), p in outcome_probabilities(g).items() if g.prize(m, s) > 0
        )
        rows.append(
            {
                "spot": spot,
                "rtp": rtp(g, taxed),
                "p_any_prize": p_win,
                "top_prize": max(KENO_PRIZES[spot].values()),
                "p_top": hypergeom_pmf(g.pool, g.drawn, spot, spot),
            }
        )
    return rows


def ev_vs_jackpot(game: GameConfig, jackpots: np.ndarray) -> np.ndarray:
    """Taxed RTP as a function of the main jackpot value (other tiers fixed)."""
    key = game.jackpot_keys[0]
    probs = outcome_probabilities(game)
    base = 0.0
    p_jack = 0.0
    for (m, s), p in probs.items():
        is_jack = (m, s) == key or (key[1] is None and m == key[0])
        if is_jack:
            p_jack += p
        else:
            base += p * after_tax(game.prize(m, s))
    taxed_jack = jackpots - (jackpots - TAX_THRESHOLD) * TAX_RATE
    return (base + p_jack * taxed_jack) / TICKET_PRICE


def score_tickets(
    game: GameConfig,
    draw_onehot: np.ndarray,
    draw_special: int,
    tickets: np.ndarray,
    ticket_specials: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Score a batch of tickets against one draw.

    Returns (main_matches, special_hit, payout) arrays of length n_tickets.
    Payout is gross (pre-tax), as in the official prize table.
    """
    matches = draw_onehot[tickets].sum(axis=1)
    if game.special == "bonus" and draw_special > 0:
        special_hit = (tickets == draw_special).any(axis=1)
    elif game.special == "separate" and ticket_specials is not None:
        special_hit = ticket_specials == draw_special
    else:
        special_hit = np.zeros(len(tickets), dtype=bool)
    payout = np.array(
        [game.prize(int(m), bool(s)) for m, s in zip(matches, special_hit)],
        dtype=np.int64,
    )
    return matches, special_hit, payout
