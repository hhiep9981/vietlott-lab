# Architecture

```
Lottery/
├── data/                   own draw data (VN runner crawl ∪ upstream), 4 jsonl
├── vietlott-data/          upstream clone (local only, gitignored)
├── src/
│   ├── main.py             CLI only (argparse) — no logic
│   ├── config.py           GameConfig, prize tables, paths, tax
│   ├── data/loader.py      jsonl -> Draws (numpy)
│   ├── data/merge.py       union of two data dirs by draw id
│   ├── data/pool_log.py    append-only log of published pools
│   ├── models/
│   │   ├── prizes.py       exact odds, EV/RTP, ticket scoring
│   │   ├── strategies.py   9 online walk-forward strategies
│   │   ├── unseen_pool.py  never-drawn pool + distribution rules strategy
│   │   └── pool_optimizer.py walk-forward optimised K-number pool (9 features)
│   ├── analysis/
│   │   ├── randomness.py   statistical test battery
│   │   └── descriptive.py  dashboard statistics
│   ├── pipelines/
│   │   ├── backtest.py     walk-forward backtest + t-test + Holm
│   │   ├── suggest.py      anti-popular ticket suggester, Keno spot, EV
│   │   ├── report.py       run all games -> analysis.json + dashboard.html
│   │   └── web/
│   │       ├── template.html   page shell + CSS (light/dark tokens)
│   │       └── js/             bundled in JS_FILES order (shared scope)
│   │           ├── core.js     format, charts, storage, seeded RNG, maths
│   │           ├── model.js    lotto state, rules, profiles, scoring
│   │           ├── pool.js     pool features/scores (mirror of pool_optimizer.py)
│   │           ├── popup.js    ticket analysis dialog
│   │           ├── analysis.js "Phân tích" view
│   │           ├── suggest.js  "Pool số" view (optimised pool + validation)
│   │           ├── search.js   "Tra cứu" view
│   │           ├── backtest.js "Backtest" view (pool: K + weight sliders)
│   │           ├── info.js     "Phương pháp" view
│   │           └── app.js      router #view/game, tabs, theme
│   └── utils/log.py
├── tests/test_core.py · tests/test_pool.py · tests/test_web.py · tests/js/check_model.js (Node)
├── .github/workflows/
│   ├── crawl.yml           self-hosted VN runner: crawl 09:00, 13:30 & 22:30 VN
│   └── update-dashboard.yml cloud fallback 01:30 VN: merge upstream, build, deploy
├── scripts/setup_runner.sh install/remove the self-hosted runner (launchd)
├── outputs/                generated (dashboard.html, analysis.json)
└── docs/
```

Data flow: `crawl.yml` (VN runner, upstream crawler code) → `data/` ←
`update-dashboard.yml` merges upstream `data/` (fallback) → build → Pages.
Browser side: the dashboard embeds full lotto history (`describe()["history"]`)
and runs search, popup and the pool backtest in JS. Rules/frequency z in
`web/js/model.js` mirror `src/models/unseen_pool.py`; pool features in
`web/js/pool.js` mirror `src/models/pool_optimizer.py` — keep both in sync
(`tests/test_web.py::test_js_pool_matches_python` checks pools and hits are
identical). `update-dashboard.yml` builds with `--log-pool`, appending each
published next-draw pool to `data/pool_log.jsonl` (one record per game and
`after_id`; local builds don't log). "Kết quả gần nhất" compares each draw
with the logged pool, else a pool reconstructed with the train-only weights. Keno is analysis-only (no history embedded).

Data dir resolution: `$VIETLOTT_DATA_DIR` > `./data` > `vietlott-data/data`.

Flow: `loader` → `Draws` → (`descriptive`, `randomness`, `backtest`,
`suggest`) → `report.build` → JSON embedded into the HTML template.

Design notes
- Pool optimiser: features at row t use draws < t, standardised across
  numbers; score = features · w; pool = top K (ties -> smaller number).
  Search 2F single-feature + 500 random unit directions × K grid. K is chosen
  by `select_k` (inner 70/30: w per K fit on the head, K by validation z of
  mean hits vs the hypergeometric null on the tail, w refit on the window) —
  used for the 70/30 hold-out, each of 6 rolling outer folds (nested
  walk-forward over the last 60%), and on all draws for the next-draw pool.
- Walk-forward: strategies are online (`update` one draw, then `tickets`);
  no look-ahead by construction (tested).
- Significance: per-draw mean matches vs hypergeometric expectation
  (one-sample t-test), Holm across strategies. ROI is reported but not used
  to rank — a single jackpot dominates it.
- Frequency chi-square corrected for no-replacement draws; pair dispersion
  p-value via Monte-Carlo (pairs are correlated).
- Windows are in draws, not days (Keno has ~119 draws/day).

## FUNCTION REGISTRY

### src/config.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `GameConfig.prize` | `(matches: int, special_hit: bool) -> int` | Prize lookup with "any special" fallback | `#config` |
| `resolve_data_dir` | `() -> Path` | Env > ./data > vietlott-data/data | `#config #path` |
| `keno_game` | `(spot: int) -> GameConfig` | Keno config for spot level 1..10 | `#config` |
| `with_jackpots` | `(game, jackpots: list[int] \| None) -> GameConfig` | Override jackpot values | `#config` |

### src/data/loader.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `load_raw` | `(game: GameConfig) -> pl.DataFrame` | Read jsonl, numeric ids, dedup, sort | `#io #json #clean` |
| `load_draws` | `(game: GameConfig) -> Draws` | Main/special/one-hot arrays | `#io #transform` |
| `Draws.tail` | `(n: int) -> Draws` | Last n draws | `#transform` |

### src/data/merge.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `read_jsonl` | `(path: Path) -> list[dict]` | Read jsonl (missing -> []) | `#io #json` |
| `merge_records` | `(primary, secondary) -> list[dict]` | Union by id, primary wins, sorted | `#merge` |
| `merge_jsonl` | `(dst: Path, src: Path) -> int` | Merge file in place, return added | `#io #merge` |
| `merge_dirs` | `(dst_dir: Path, src_dir: Path) -> dict[str, int]` | Merge all product files | `#io #merge` |

### src/data/pool_log.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `append_pool` | `(path: Path, record: dict) -> bool` | Append unless (game, after_id) already logged | `#io #json` |
| `game_log` | `(path: Path, game: str) -> list[dict]` | One game's logged pools, oldest first | `#io #json` |

### src/models/prizes.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `after_tax` | `(prize: float) -> float` | 10% PIT above 10M VND | `#eval` |
| `hypergeom_pmf` | `(pool, drawn, pick, m) -> float` | P(m matches) | `#eval` |
| `outcome_probabilities` | `(game) -> dict[(m, s), float]` | Exact outcome odds incl. special | `#eval` |
| `prize_tiers` | `(game) -> list[dict]` | Official tiers + probability | `#eval` |
| `expected_return` | `(game, taxed=True) -> float` | EV per ticket (VND) | `#eval` |
| `rtp` | `(game, taxed=True) -> float` | EV / ticket price | `#eval` |
| `keno_rtp_table` | `(taxed=True) -> list[dict]` | RTP per Keno spot | `#eval` |
| `ev_vs_jackpot` | `(game, jackpots: np.ndarray) -> np.ndarray` | RTP as function of jackpot | `#eval` |
| `score_tickets` | `(game, draw_onehot, draw_special, tickets, ticket_specials=None) -> (m, s, payout)` | Score tickets vs a draw | `#eval` |

### src/models/strategies.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `weighted_sample` | `(rng, weights, k, n) -> np.ndarray` | Gumbel top-k sampling w/o replacement | `#predict` |
| `Strategy.update` | `(x: np.ndarray) -> None` | Observe one draw | `#train` |
| `Strategy.weights` | `() -> np.ndarray` | Mixed model/uniform weights | `#predict` |
| `Strategy.tickets` | `(rng, n) -> np.ndarray` | Sample n tickets (1-based) | `#predict` |
| Classes | `RandomStrategy, HotStrategy, ColdStrategy, NotRepeatStrategy, ExpDecayStrategy, LongAbsenceStrategy, MarkovStrategy, PairFrequencyStrategy, PatternStrategy` | Ports of upstream strategies | `#ml` |

### src/models/unseen_pool.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `mode_weights` | `(z: np.ndarray, mode: str, strength=1.0) -> np.ndarray` | hot / cold / balanced weights from frequency z | `#predict` |
| `split_modes` | `(n: int, split=DEFAULT_SPLIT) -> list[str]` | Allocate tickets to modes (10 -> 4/4/2) | `#predict` |
| `central_values` | `(probs: np.ndarray, mass=0.8) -> np.ndarray` | Most likely values covering `mass` | `#eval` |
| `theoretical_shape` | `(game, sum_conf=0.8) -> tuple` | Normal sum band, allowed odd/low counts | `#eval` |
| `UnseenPoolStrategy.rules` | `() -> ShapeRules` | Sum/odd/low + spacing percentiles (online) | `#validate` |
| `UnseenPoolStrategy.frequency_z` | `() -> np.ndarray` | Mean of all-time and recent z-scores | `#transform` |
| `UnseenPoolStrategy.passes` | `(tickets, rules) -> np.ndarray` | Vectorised rule check | `#validate` |
| `UnseenPoolStrategy.tickets` | `(rng, n) -> np.ndarray` | Never-drawn, rule-passing, diversified tickets | `#predict` |
| `UnseenPoolStrategy.describe` | `(ticket) -> dict` | Per-ticket diagnostics | `#eval` |

### src/analysis/randomness.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `frequency_test` | `(draws) -> dict` | Corrected chi-square on counts | `#eval` |
| `special_frequency_test` | `(draws) -> dict \| None` | Chi-square on special/bonus | `#eval` |
| `repeat_test` | `(draws) -> dict` | Repeats from previous draw z-test | `#eval` |
| `autocorrelation_test` | `(draws, lags) -> dict` | Per-number lag autocorrelation | `#eval` |
| `gap_test` | `(draws) -> dict` | Gaps vs geometric | `#eval` |
| `simulate_onehot` | `(rng, n, pool, drawn) -> np.ndarray` | Fair draws simulator | `#eval` |
| `pair_dispersion_test` | `(draws, n_sim=200, seed=0) -> dict` | Pair counts, Monte-Carlo p | `#eval` |
| `sum_test` | `(draws, n_sim, seed) -> dict` | KS on sums vs simulation | `#eval` |
| `parity_test` | `(draws) -> dict` | Odd count vs hypergeometric | `#eval` |
| `all_gaps` | `(draws) -> np.ndarray` | Pooled gaps | `#transform` |
| `run_all` | `(draws) -> list[dict]` | Full battery + Bonferroni | `#eval` |

### src/analysis/descriptive.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `frequency` | `(draws, recent) -> dict` | All-time & recent counts, z | `#transform` |
| `gaps` | `(draws) -> dict` | Current/mean/max gap, histogram | `#transform` |
| `pairs` | `(draws, top=25) -> dict` | Pair matrix ratio, top/bottom | `#transform` |
| `triplets` | `(draws, top=20) -> dict \| None` | Top triplets (not Keno) | `#transform` |
| `structure` | `(draws, n_sim, seed) -> dict` | Sum/odd/low/consec/repeat/buckets vs null | `#transform` |
| `period_heatmap` | `(draws) -> dict` | Number × year/quarter deviation | `#transform` |
| `special` | `(draws) -> dict \| None` | Special number counts | `#transform` |
| `recent_draws` | `(draws, n=30) -> list[dict]` | Latest results | `#transform` |
| `keno_sides` | `(draws) -> dict` | Big/even count distributions | `#transform` |
| `buckets` | `(draws, size) -> dict` | Counts per range of `size` numbers vs expected | `#transform` |
| `waiting_times` | `(draws) -> dict \| None` | Wait until a draw has an adjacent pair / a repeat (lotto) | `#eval` |
| `history` | `(draws) -> dict \| None` | Compact full history for the browser (lotto) | `#io` |
| `describe` | `(draws, recent) -> dict` | All of the above | `#transform` |

### src/models/pool_optimizer.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `pool_features` | `(onehot: np.ndarray) -> np.ndarray` | (T+1, N, F) standardised features, row t from draws < t: freq all/10/30/100, absence, last, pair, Markov lag 1/2 | `#transform` |
| `hits_by_rank` | `(X, target, W) -> np.ndarray` | Winning numbers among top-r scores for every weight vector | `#eval` |
| `candidate_weights` | `(seed, n) -> np.ndarray` | ±single features + random unit directions | `#train` |
| `pool_stats` | `(hits, expected) -> PoolStats` | Lift, CI95, t-test p vs random pool | `#eval` |
| `select_k` | `(hits, idx, e, sd) -> (m, j, val_z)` | Nested rule on training rows: w per K on first 70%, K by validation z on the rest, w refit on all | `#train #validate` |
| `nested_folds` | `(hits, e, sd, ks, dates) -> dict` | 6 rolling outer folds: K per fold, pooled OOS lift, OOS lift per K | `#eval` |
| `optimise_pool` | `(draws, k_grid=None, seed=SEED, n_weights=500) -> dict` | Hold-out + nested folds + per-K table + next-draw pool payload | `#train #predict` |

### src/pipelines/backtest.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `prize_matrix` | `(game) -> np.ndarray` | prize[m, s] lookup | `#eval` |
| `holm` | `(pvals: list[float]) -> list[float]` | Holm adjustment | `#eval` |
| `run_strategy` | `(strategy, draws, start, n_tickets, rng, curve_points=300) -> BacktestResult` | Walk-forward one strategy | `#eval` |
| `run_backtest` | `(draws, n_tickets=10, warmup=None, max_eval=None, strategies=None) -> list[BacktestResult]` | All strategies, same period | `#eval` |

### src/pipelines/suggest.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `popularity` | `(ticket, game, last, history) -> (float, list[str])` | Heuristic popularity score | `#predict` |
| `suggest` | `(draws, n=5, max_overlap=None, strategy=None, n_candidates=50000, seed=None) -> list[Suggestion]` | Anti-popular, diversified tickets | `#predict` |
| `suggest_unseen_pool` | `(draws, n=10, seed=None) -> dict` | 10 never-drawn tickets (4 hot / 4 cold / 2 balanced) + rules (CLI `suggest --unseen`; no longer in the dashboard) | `#predict` |
| `keno_suggest` | `(n=5, spot=None, seed=None) -> dict` | Best-RTP spot + random tickets | `#predict` |
| `breakeven_jackpot` | `(game) -> float \| None` | Jackpot where RTP = 100% | `#eval` |
| `value_summary` | `(game) -> dict` | RTP / break-even summary | `#eval` |

### src/pipelines/report.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `ev_curve` | `(game, points=60) -> dict` | RTP vs jackpot series | `#eval` |
| `log_pool` | `(key, pool: dict) -> bool` | Record the published next-draw pool | `#io` |
| `analyse_game` | `(key, n_suggest=6, run_bt=True, log=False) -> dict` | All analyses for one game (+ pool, pool log) | `#io` |
| `build` | `(games=None, run_bt=True, log=False) -> Path` | Write analysis.json + dashboard | `#io #json` |
| `render_html` | `(payload=None) -> Path` | Bundle web/js + data into template | `#io` |

### src/utils/log.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `get_logger` | `(name: str) -> logging.Logger` | Stdlib logger | `#log` |

### src/pipelines/web/js (browser)
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `seededRng` | `(seed) -> () => number` | mulberry32 seeded by hash32(seed) | `#predict` |
| `hypergeom` / `comb` | `(pool, drawn, pick, m)` | Exact odds | `#eval` |
| `getModel` | `(key) -> model` | Draws, prize table, final state (cached) | `#io` |
| `LottoState.update` | `(draw)` | Walk-forward counts, history, profiles | `#train` |
| `LottoState.cache` | getter | freqZ, hot/cold classes, rules, profiles | `#transform` |
| `profileOf` | `(state, nums) -> profile` | Composition: hot/cold/mid, repeats, adjacent | `#transform` |
| `passesRules` | `(nums, rules) -> bool` | Standard filter (sum/odd/low/gap/adjacent) | `#validate` |
| `scoreTicket` | `(model, draw, ticket) -> {matches, sHit, prize}` | Official prize lookup | `#eval` |
| `ticketFeatures` / `simShapes` | `(model, nums)` | Shape features; 20k random baseline | `#eval` |
| `openTicket` | `(key, nums, special, ctx)` | Ticket analysis popup | `#eval` |
| `poolFeatures` | `(model) -> Float64Array` | Mirror of `pool_features` (cached on model) | `#transform` |
| `poolScores` / `poolAt` | `(model, t, w[, K])` | Scores / top-K pool before draw t | `#predict` |
| `poolBacktest` | `(model, w, K, start) -> [{t, pool, hits}]` | Walk-forward pool hits | `#eval` |
| `poolLift` | `(hits, expected) -> {mean, lift, lo, hi, p}` | Lift vs random pool | `#eval` |
| `weightsChart` / `excessChart` | `(id, ...)` | Weight bars; cumulative hits − expected | `#eval` |
| `poolHistory` | `(model, P) -> [{t, K, pool, source, hits, ranks}]` | Pool before each draw: logged, else reconstructed (train-only w); score rank of each winner | `#eval` |
| `recentVsPoolHtml` / `drawRankChart` | `(key, G)` | Recent results vs pool table, summary tiles, winners-by-rank chart | `#eval` |
