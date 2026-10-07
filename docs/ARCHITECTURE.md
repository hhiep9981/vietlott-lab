# Architecture

```
Lottery/
├── vietlott-data/          upstream clone (read-only data source)
├── src/
│   ├── main.py             CLI only (argparse) — no logic
│   ├── config.py           GameConfig, prize tables, paths, tax
│   ├── data/loader.py      jsonl -> Draws (numpy)
│   ├── models/
│   │   ├── prizes.py       exact odds, EV/RTP, ticket scoring
│   │   └── strategies.py   9 online walk-forward strategies
│   ├── analysis/
│   │   ├── randomness.py   statistical test battery
│   │   └── descriptive.py  dashboard statistics
│   ├── pipelines/
│   │   ├── backtest.py     walk-forward backtest + t-test + Holm
│   │   ├── suggest.py      anti-popular ticket suggester, Keno spot, EV
│   │   ├── report.py       run all games -> analysis.json + dashboard.html
│   │   └── dashboard_template.html
│   └── utils/log.py
├── tests/test_core.py
├── outputs/                generated (dashboard.html, analysis.json)
└── docs/
```

Flow: `loader` → `Draws` → (`descriptive`, `randomness`, `backtest`,
`suggest`) → `report.build` → JSON embedded into the HTML template.

Design notes
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
| `keno_game` | `(spot: int) -> GameConfig` | Keno config for spot level 1..10 | `#config` |
| `with_jackpots` | `(game, jackpots: list[int] \| None) -> GameConfig` | Override jackpot values | `#config` |

### src/data/loader.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `load_raw` | `(game: GameConfig) -> pl.DataFrame` | Read jsonl, numeric ids, dedup, sort | `#io #json #clean` |
| `load_draws` | `(game: GameConfig) -> Draws` | Main/special/one-hot arrays | `#io #transform` |
| `Draws.tail` | `(n: int) -> Draws` | Last n draws | `#transform` |

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
| `describe` | `(draws, recent) -> dict` | All of the above | `#transform` |

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
| `keno_suggest` | `(n=5, spot=None, seed=None) -> dict` | Best-RTP spot + random tickets | `#predict` |
| `breakeven_jackpot` | `(game) -> float \| None` | Jackpot where RTP = 100% | `#eval` |
| `value_summary` | `(game) -> dict` | RTP / break-even summary | `#eval` |

### src/pipelines/report.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `ev_curve` | `(game, points=60) -> dict` | RTP vs jackpot series | `#eval` |
| `analyse_game` | `(key, n_suggest=6, run_bt=True) -> dict` | All analyses for one game | `#io` |
| `build` | `(games=None, run_bt=True) -> Path` | Write analysis.json + dashboard | `#io #json` |
| `render_html` | `(payload=None) -> Path` | Render template from JSON | `#io` |

### src/utils/log.py
| Function | Signature | Purpose | Tags |
|----------|-----------|---------|------|
| `get_logger` | `(name: str) -> logging.Logger` | Stdlib logger | `#log` |
