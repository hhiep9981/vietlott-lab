"""Dashboard web code: JS model checks (via Node) and HTML bundling."""

import json
import shutil
import subprocess
from math import comb
from pathlib import Path

import numpy as np
import pytest

from src.analysis.descriptive import buckets, history, special, waiting_times
from src.config import GAMES, LOTTO_535, POWER_655
from src.data.loader import load_draws
from src.models.prizes import prize_tiers
from src.pipelines.report import JS_FILES, WEB_DIR

ROOT = Path(__file__).resolve().parent.parent
LOTTO_KEYS = ["power655", "power645", "power535"]


# --- new descriptive statistics -----------------------------------------
def test_buckets_cover_all_draw_numbers():
    d = load_draws(POWER_655)
    for size in (5, 10):
        b = buckets(d, size)
        assert sum(b["obs"]) == len(d) * POWER_655.drawn
        assert sum(b["exp"]) == pytest.approx(len(d) * POWER_655.drawn, rel=1e-3)
    assert buckets(d, 5)["labels"][-1] == "51-55"


def test_waiting_time_theory_matches_simulation():
    rng = np.random.default_rng(0)
    n_pool, k, n = 45, 6, 200_000
    idx = np.argpartition(rng.random((n, n_pool)), k, axis=1)[:, :k]
    oh = np.zeros((n, n_pool), dtype=bool)
    np.put_along_axis(oh, idx, True, axis=1)
    p_adj = (oh[:, 1:] & oh[:, :-1]).any(axis=1).mean()
    assert p_adj == pytest.approx(1 - comb(n_pool - k + 1, k) / comb(n_pool, k), abs=0.005)


def test_waiting_times_shape():
    w = waiting_times(load_draws(POWER_655))
    for key in ("adjacent", "repeat"):
        e = w[key]
        assert 0 < e["p_theory"] < 1
        assert abs(e["p_obs"] - e["p_theory"]) < 0.05
        assert len(e["hist_obs"]) == len(e["hist_exp"]) == len(e["hist_k"])
    assert waiting_times(load_draws(GAMES["keno"])) is None


def test_special_recent_window():
    s = special(load_draws(LOTTO_535), recent=100)
    assert s["recent_n"] == 100 and sum(s["counts_recent"]) == 100
    assert s["expected_recent"] == pytest.approx(100 / 12)


def test_history_payload_roundtrip():
    d = load_draws(LOTTO_535)
    h = history(d)
    assert len(h["main"]) == len(d) and h["main"][-1] == d.main[-1].tolist()
    assert history(load_draws(GAMES["keno"])) is None


# --- JS model under Node -------------------------------------------------
@pytest.fixture(scope="module")
def js_results(tmp_path_factory):
    if shutil.which("node") is None:
        pytest.skip("node not installed")
    games = {}
    for key in LOTTO_KEYS:
        g = GAMES[key]
        d = load_draws(g)
        games[key] = {
            "meta": {"key": key, "name": g.name, "pool": g.pool, "drawn": g.drawn},
            "value": {"tiers": prize_tiers(g)},
            "history": history(d),
        }
    path = tmp_path_factory.mktemp("web") / "data.json"
    path.write_text(json.dumps({"games": games}))
    out = subprocess.run(
        ["node", str(ROOT / "tests/js/check_model.js"), str(path), str(WEB_DIR / "js")],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(out.stdout)


@pytest.mark.parametrize("key", LOTTO_KEYS)
def test_js_strategies_valid(js_results, key):
    r = js_results[key]
    assert r["historySize"] <= r["nDraws"] and r["profiles"] > 10
    for name, s in r["strategies"].items():
        assert s["n"] == 10, name
        assert s["deterministic"], name
        assert s["valid"], name
        assert s["inHistory"] == 0, name
        assert s["special"], name
        if name.endswith("+F") and not name.startswith("weird"):
            assert s["passRules"] == 10, name
    assert all(lbl for lbl in r["strategies"]["weird+F"]["labels"])
    assert r["hypergeomSum"] == pytest.approx(1.0)


@pytest.mark.parametrize("key", LOTTO_KEYS)
def test_js_prize_table_matches_python(js_results, key):
    g = GAMES[key]
    prize = js_results[key]["prize"]
    for m in range(g.pick + 1):
        for s in (False, True):
            assert prize[m][int(s)] == g.prize(m, s), (m, s)


def test_js_scoring_power655_bonus(js_results):
    r = js_results["power655"]
    assert r["scoreSelf"]["matches"] == 6
    assert r["scoreJ2"] == {"matches": 5, "sHit": True, "prize": 3_000_000_000}


# --- bundling ------------------------------------------------------------
def test_all_js_files_exist_and_template_has_slots():
    for name in JS_FILES:
        assert (WEB_DIR / "js" / name).exists(), name
    t = (WEB_DIR / "template.html").read_text()
    assert "/*__JS__*/" in t and "/*__DATA__*/null" in t
