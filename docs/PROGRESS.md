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

## 2026-10-07 — Session 1c: daily auto-update
- `.github/workflows/update-dashboard.yml`: daily 18:30 UTC (01:30 VN) +
  manual (`force` input). Sparse-checkouts `data/` from
  vietvudanh/vietlott-data (no crawling: Vietlott blocks non-VN IPs),
  skips when the sha256 of the 4 jsonl files equals `outputs/data.sha256`,
  else tests -> build -> commits outputs as github-actions[bot].
- GitHub Pages switched from branch deploy to Actions deploy (`deploy` job
  publishes `index.html` + `outputs/dashboard.html`; also runs on push).

## 2026-10-07 — Session 1d: own crawl on self-hosted VN runner
- `data/` added to repo (seeded from upstream, Keno deduped).
- `crawl.yml` on `[self-hosted, vn]`: upstream crawler code + own data,
  `vietlott-crawl` + `vietlott-missing` for 4 products, commit `data/`,
  dispatch `update-dashboard.yml`. Never triggered by PRs.
- `update-dashboard.yml` now merges upstream into `data/` (fallback).
- `scripts/setup_runner.sh` (user runs once): official runner, digest
  verified, launchd service, label `vn`.
- Repo setting: fork PR workflows need approval (all external contributors).
- Verified the upstream crawler works from the user's Mac (VN IP).
- 30 tests passing.

## 2026-10-07 — Session 1e: per-visitor tickets on the dashboard
- Self-hosted runner installed by the user (MaxPookBro-vn); first scheduled
  crawl ran at 13:45 VN and triggered a dashboard rebuild.
- Dashboard generates a personal 10-ticket set per visitor in the browser
  (GitHub Pages is static, so no IP access): seed = random device id in
  localStorage + VN date + product + "Tạo bộ khác" counter, mulberry32 PRNG,
  same unseen-pool rules as Python (`client` payload from
  `suggest_unseen_pool`). No IP / personal data collected.
- Verified in browser: 300 simulated devices -> all sets pass rules and
  exclude history; stable across reload; hot/cold/balanced mean z
  +0.61 / -0.62 / 0.00; ~0.3 ms per set.
- 31 tests passing.

Next / ideas
- Add historical jackpot values (if a source is found) → "play only when
  jackpot ≥ break-even" backtest, and jackpot-sharing estimates.
- Re-check Lotto 5/35 odd/even signal (raw p=0.008) as data grows; use a
  held-out period to confirm (pre-registered).
- Keno: time-of-day analysis needs draw timestamps (not in data).
