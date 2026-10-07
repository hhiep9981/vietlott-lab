import numpy as np
import pytest

from src.analysis.randomness import frequency_test, repeat_test, simulate_onehot
from src.config import GAMES, LOTTO_535, MEGA_645, POWER_655, keno_game
from src.data.loader import Draws, load_draws
from src.models.prizes import outcome_probabilities, prize_tiers, rtp, score_tickets
from src.models.strategies import ALL_STRATEGIES, weighted_sample
from src.pipelines.backtest import holm
from src.pipelines.suggest import popularity


def onehot(nums: list[int], pool: int) -> np.ndarray:
    x = np.zeros(pool + 1, dtype=bool)
    x[nums] = True
    return x


def fake_draws(game, n: int, seed: int = 1) -> Draws:
    rng = np.random.default_rng(seed)
    oh = np.zeros((n, game.pool + 1), dtype=bool)
    oh[:, 1:] = simulate_onehot(rng, n, game.pool, game.drawn)
    main = np.array([np.flatnonzero(r) for r in oh])
    return Draws(
        game,
        np.array([f"2020-01-{i % 28 + 1:02d}" for i in range(n)]),
        np.arange(n),
        main,
        np.full(n, -1),
        oh,
    )


# --- prizes -------------------------------------------------------------
def test_power655_official_odds():
    odds = {(t["matches"], t["special"]): round(t["odds"]) for t in prize_tiers(POWER_655)}
    assert odds[(6, None)] == 28_989_675
    assert odds[(5, True)] == 4_831_613
    assert odds[(5, False)] == 100_659


def test_probabilities_sum_to_one():
    for g in (POWER_655, MEGA_645, LOTTO_535, keno_game(10)):
        assert sum(outcome_probabilities(g).values()) == pytest.approx(1.0)


def test_power655_bonus_not_counted_as_main_match():
    # Case the upstream readme scored as a 5 billion "5 matches" win.
    draw = onehot([5, 26, 28, 29, 33, 54], 55)
    ticket = np.array([[28, 29, 31, 33, 34, 54]])
    m, s, pay = score_tickets(POWER_655, draw, 34, ticket)
    assert (m[0], bool(s[0]), pay[0]) == (4, True, 500_000)


def test_power655_jackpot2_needs_five_main_plus_bonus():
    draw = onehot([1, 2, 3, 4, 5, 6], 55)
    ticket = np.array([[1, 2, 3, 4, 5, 7]])
    assert score_tickets(POWER_655, draw, 7, ticket)[2][0] == 3_000_000_000
    assert score_tickets(POWER_655, draw, 9, ticket)[2][0] == 40_000_000


def test_lotto535_special_only_wins_consolation():
    draw = onehot([1, 2, 3, 4, 5], 35)
    ticket = np.array([[10, 11, 12, 13, 14]])
    pay = score_tickets(LOTTO_535, draw, 7, ticket, np.array([7]))[2][0]
    assert pay == 10_000


def test_keno_spot1_rtp_is_half():
    assert rtp(keno_game(1), taxed=False) == pytest.approx(0.5)


# --- data ---------------------------------------------------------------
@pytest.mark.parametrize("key", list(GAMES))
def test_loader_shapes(key):
    d = load_draws(GAMES[key])
    g = d.game
    assert d.main.shape[1] == g.drawn
    assert (d.onehot.sum(axis=1) == g.drawn).all()
    assert len(set(d.ids.tolist())) == len(d)
    assert (np.diff(d.main, axis=1) > 0).all()


# --- strategies ---------------------------------------------------------
def test_weighted_sample_distinct_sorted():
    rng = np.random.default_rng(0)
    s = weighted_sample(rng, np.ones(45) / 45, 6, 500)
    assert s.shape == (500, 6)
    assert (np.diff(s, axis=1) > 0).all()
    assert s.min() >= 0 and s.max() < 45


@pytest.mark.parametrize("cls", ALL_STRATEGIES)
def test_strategy_tickets_valid_and_no_lookahead(cls):
    draws = fake_draws(MEGA_645, 200)
    a, b = cls(MEGA_645), cls(MEGA_645)
    for i in range(150):
        a.update(draws.onehot[i])
        b.update(draws.onehot[i])
    t1 = a.tickets(np.random.default_rng(3), 20)
    # b sees one more (future) draw; a must not depend on it.
    b.update(draws.onehot[150])
    t2 = a.tickets(np.random.default_rng(3), 20)
    assert (t1 == t2).all()
    assert t1.shape == (20, 6)
    assert t1.min() >= 1 and t1.max() <= 45
    assert all(len(set(r)) == 6 for r in t1.tolist())


def test_holm_monotone_and_bounded():
    adj = holm([0.01, 0.04, 0.03, 0.5])
    assert adj[0] == pytest.approx(0.04)
    assert all(0 <= p <= 1 for p in adj)


# --- randomness tests ---------------------------------------------------
def test_fair_simulation_passes_tests():
    draws = fake_draws(POWER_655, 3000, seed=7)
    assert frequency_test(draws)["p_value"] > 0.001
    assert repeat_test(draws)["p_value"] > 0.001


def test_frequency_test_detects_bias():
    draws = fake_draws(MEGA_645, 3000, seed=7)
    draws.onehot[:, 1] = True  # number 1 in every draw
    assert frequency_test(draws)["p_value"] < 1e-6


# --- suggestions --------------------------------------------------------
def test_popularity_penalises_patterns():
    pattern, _ = popularity(np.array([5, 10, 15, 20, 25, 30]), POWER_655, set(), set())
    spread, _ = popularity(np.array([3, 17, 34, 41, 48, 55]), POWER_655, set(), set())
    assert pattern > spread


# --- unseen pool --------------------------------------------------------
def test_split_modes_4_4_2():
    from src.models.unseen_pool import split_modes

    m = split_modes(10)
    assert (m.count("hot"), m.count("cold"), m.count("balanced")) == (4, 4, 2)


def test_unseen_pool_tickets_follow_rules():
    from src.pipelines.suggest import suggest_unseen_pool

    draws = load_draws(POWER_655)
    res = suggest_unseen_pool(draws, n=10, seed=5)
    history = {tuple(r.tolist()) for r in draws.main}
    r = res["rules"]
    assert len(res["tickets"]) == 10
    for t in res["tickets"]:
        nums = t["numbers"]
        assert tuple(nums) not in history
        assert r["sum_lo"] <= sum(nums) <= r["sum_hi"]
        assert t["odd"] in r["odd_ok"] and t["low"] in r["low_ok"]
        assert max(t["gaps"]) <= r["max_gap"]
        assert sum(g == 1 for g in t["gaps"]) <= r["max_adjacent"]


def test_unseen_pool_excludes_exact_history():
    from src.models.unseen_pool import UnseenPoolStrategy

    draws = fake_draws(MEGA_645, 300)
    s = UnseenPoolStrategy(MEGA_645)
    for row in draws.onehot:
        s.update(row)
    t = s.tickets(np.random.default_rng(0), 30)
    assert not any(tuple(x.tolist()) in s.history for x in t)


def test_mode_weights_direction():
    from src.models.unseen_pool import mode_weights

    z = np.array([-2.0, 0.0, 2.0])
    assert mode_weights(z, "hot").argmax() == 2
    assert mode_weights(z, "cold").argmax() == 0
    assert mode_weights(z, "balanced").argmax() == 1
