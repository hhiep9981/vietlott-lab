# Progress

## 2026-10-07 — Session 1
Done
- Scanned `vietlott-data`; found prize-scoring bug behind upstream ML readme ROIs.
- Collected official prize tables (Keno 39 tiers, 5/35, 6/45, 6/55).
- Built `src/` package outside the upstream clone (user requirement).
- Corrected backtest engine (per-product prizes, bonus/special handling),
  9 strategies re-implemented as online walk-forward models.
- Randomness test battery (8 tests) on all 4 products → no significant bias.
- Ticket suggester (anti-popular + diversified), Keno spot recommendation,
  EV vs jackpot / break-even jackpot.
- Static dashboard `outputs/dashboard.html` (ECharts, light/dark, VN UI).
- 24 tests passing.
- Published: repo https://github.com/hhiep9981/vietlott-lab (public),
  GitHub Pages https://hhiep9981.github.io/vietlott-lab/ (branch main, root;
  `index.html` redirects to `outputs/dashboard.html`). Excluded from git:
  `vietlott-data/`, `Knowledge/` (copyrighted PDFs), `.venv`, `.claude/`.
  To update the site: rebuild dashboard, commit `outputs/`, push.

## 2026-10-07 — Session 1b: unseen-pool method
- New `UnseenPoolStrategy` (src/models/unseen_pool.py): pool excludes exact
  past combinations; filters: sum in central 80% normal band, odd/low counts
  in most likely values, max in-ticket gap <= hist. P95, adjacent pairs <=
  hist. P90; frequency weighting 4 hot / 4 cold / 2 balanced.
- `suggest_unseen_pool` + CLI `suggest <game> --unseen` + dashboard section
  (6/55, 6/45, 5/35; Keno excluded).
- Walk-forward backtest (30 tickets/draw): lift +0.29% (6/55), +0.17%
  (6/45), -0.53% (5/35); all CIs include 0 -> no better than random.
- 28 tests passing.

Next / ideas
- Add historical jackpot values (if a source is found) → "play only when
  jackpot ≥ break-even" backtest, and jackpot-sharing estimates.
- Re-check Lotto 5/35 odd/even signal (raw p=0.008) as data grows; use a
  held-out period to confirm (pre-registered).
- Keno: time-of-day analysis needs draw timestamps (not in data).
