"""Pool optimiser: no look-ahead, null behaviour, planted-signal recovery."""

import numpy as np
import pytest

from src.config import MEGA_645
from src.data.pool_log import append_pool, game_log
from src.data.loader import Draws
from src.models.pool_optimizer import (
    FEATURES,
    optimise_pool,
    pool_features,
    pool_stats,
)


def _fake_draws(rng: np.random.Generator, n: int, weights: np.ndarray) -> Draws:
    """n draws of 6 from 45, numbers sampled proportional to weights."""
    pool = len(weights)
    p = weights / weights.sum()
    main = np.sort(
        np.array([rng.choice(pool, 6, replace=False, p=p) + 1 for _ in range(n)]),
        axis=1,
    )
    onehot = np.zeros((n, pool + 1), dtype=bool)
    np.put_along_axis(onehot, main, True, axis=1)
    dates = np.array([str(np.datetime64("2020-01-01") + np.timedelta64(i, "D")) for i in range(n)])
    return Draws(MEGA_645, dates, np.arange(n), main, np.full(n, -1), onehot)


def test_features_have_no_lookahead():
    rng = np.random.default_rng(1)
    d = _fake_draws(rng, 300, np.ones(45))
    X = pool_features(d.onehot[:, 1:])
    oh2 = d.onehot[:, 1:].copy()
    oh2[200:] = oh2[rng.permutation(np.arange(200, 300))]
    oh2[250] = np.roll(oh2[250], 3)
    X2 = pool_features(oh2)
    assert X.shape == (301, 45, len(FEATURES))
    np.testing.assert_array_equal(X[:201], X2[:201])
    assert not np.allclose(X[251:], X2[251:])


def test_features_standardised_per_draw():
    d = _fake_draws(np.random.default_rng(2), 200, np.ones(45))
    X = pool_features(d.onehot[:, 1:])[150]
    np.testing.assert_allclose(X.mean(axis=0), 0, atol=1e-9)
    np.testing.assert_allclose(X.std(axis=0), 1, atol=1e-9)


def test_null_data_gives_no_test_lift():
    d = _fake_draws(np.random.default_rng(3), 900, np.ones(45))
    r = optimise_pool(d, n_weights=100)
    s = r["chosen"]["test"]
    assert r["table"][0]["train"]["lift_pct"] > 0  # selection bias on train
    assert s["ci95"][0] < 0 < s["ci95"][1] or s["p_value"] > 0.01


def test_planted_hot_numbers_are_found():
    w = np.ones(45)
    w[:8] = 2.0  # numbers 1..8 drawn twice as often
    r = optimise_pool(_fake_draws(np.random.default_rng(4), 900, w), n_weights=100)
    assert r["chosen"]["test"]["p_value"] < 0.001
    assert r["chosen"]["test"]["lift_pct"] > 10
    assert set(range(1, 9)) <= set(r["final"]["pool"])


def test_pool_stats_lift():
    s = pool_stats(np.array([2, 1, 2, 1, 2, 0, 1, 3]), expected=1.5)
    assert s.lift_pct == pytest.approx(0.0)
    assert s.ci95[0] < 0 < s.ci95[1] and s.p_value == pytest.approx(1.0)


def test_payload_shape():
    d = _fake_draws(np.random.default_rng(5), 400, np.ones(45))
    r = optimise_pool(d, k_grid=(7, 10), n_weights=20)
    f = r["final"]
    assert len(f["pool"]) == f["k"] and f["pool"] == sorted(f["pool"])
    assert len(f["scores"]) == 45 and len(f["weights"]) == len(FEATURES)
    assert len(r["series"]["hits"]) == len(d) - r["warmup"]
    assert sum(r["dist_test"]["obs"]) == pytest.approx(sum(r["dist_test"]["exp"]))
    assert [row["k"] for row in r["table"]] == [7, 10]


def test_planted_markov_transition_is_found():
    """Number 2 follows number 1 (drawn next draw) far more often than chance."""
    rng = np.random.default_rng(6)
    base = _fake_draws(rng, 900, np.ones(45))
    main = base.main.copy()
    for t in range(1, len(main)):
        if 1 in main[t - 1] and 2 not in main[t] and rng.random() < 0.9:
            row = main[t]
            row[rng.integers(6)] = 2
            main[t] = np.sort(row)
    onehot = np.zeros_like(base.onehot)
    np.put_along_axis(onehot, main, True, axis=1)
    X = pool_features(onehot[:, 1:])
    m1 = FEATURES.index("markov1")
    after_1 = [t for t in range(200, len(main)) if 1 in main[t - 1]]
    assert np.mean([X[t, 1, m1] for t in after_1]) > 2  # number 2 stands out


def test_pool_log_appends_once(tmp_path):
    path = tmp_path / "pool_log.jsonl"
    rec = {"game": "power645", "after_id": 10, "k": 8, "pool": [1, 2], "weights": []}
    assert append_pool(path, rec)
    assert not append_pool(path, dict(rec, pool=[3, 4]))  # same draw: kept first
    assert append_pool(path, dict(rec, after_id=9))
    assert append_pool(path, dict(rec, game="power655"))
    assert [r["after_id"] for r in game_log(path, "power645")] == [9, 10]
    assert game_log(path, "power645")[1]["pool"] == [1, 2]


def test_select_k_uses_only_training_rows():
    from src.models.pool_optimizer import select_k

    rng = np.random.default_rng(7)
    hits = rng.integers(0, 4, size=(200, 30, 4)).astype(np.int16)
    e, sd = np.array([1.0, 1.5, 2.0, 2.5]), np.ones(4)
    idx = np.arange(120)
    a = select_k(hits, idx, e, sd)
    hits2 = hits.copy()
    hits2[120:] = 0  # future rows changed
    b = select_k(hits2, idx, e, sd)
    assert a[:2] == b[:2] and np.allclose(a[2], b[2])
    # K is picked on the validation tail, not on the fitting head
    hits3 = hits.copy()
    hits3[84:120, :, 2] += 3
    assert select_k(hits3, idx, e, sd)[1] == 2


def test_nested_folds_payload():
    d = _fake_draws(np.random.default_rng(8), 600, np.ones(45))
    r = optimise_pool(d, k_grid=(7, 10, 13), n_weights=30)
    nf = r["nested"]
    assert len(nf["folds"]) == nf["n_folds"]
    assert sum(f["test"]["n"] for f in nf["folds"]) == nf["pooled"]["n"]
    assert all(f["k"] in (7, 10, 13) for f in nf["folds"])
    assert [x["k"] for x in nf["per_k"]] == [7, 10, 13]
    assert all(x["n"] == nf["pooled"]["n"] for x in nf["per_k"])
    assert r["final"]["k"] in (7, 10, 13) and len(r["final"]["pool"]) == r["final"]["k"]
