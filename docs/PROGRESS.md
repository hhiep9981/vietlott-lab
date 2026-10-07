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

Next / ideas
- Add historical jackpot values (if a source is found) → "play only when
  jackpot ≥ break-even" backtest, and jackpot-sharing estimates.
- Re-check Lotto 5/35 odd/even signal (raw p=0.008) as data grows; use a
  held-out period to confirm (pre-registered).
- Keno: time-of-day analysis needs draw timestamps (not in data).
