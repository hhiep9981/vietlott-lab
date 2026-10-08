# Vietlott Lab — Project

## Goal
Research workspace for four Vietlott products: **Power 6/55, Mega 6/45,
Lotto 5/35, Keno**.

1. Find an optimal, *statistically verified* play strategy and suggest tickets.
2. Static HTML dashboard: frequency, gaps, pairs/triplets, draw structure,
   randomness tests, backtest, expected value.

## Key findings (2026-10-07)
- The upstream ranking in `vietlott-data/src/machine_learning/readme.md`
  (Pattern +3647% ROI etc.) is a **scoring bug**: the 6/55 bonus number is
  counted as a main match and every "5 matches" is paid 5 billion VND.
  Example: 2025-07-26 ticket hit 4 main + bonus (500,000 VND) but was booked
  as 5 billion.
- With correct prize tables all 9 strategies are indistinguishable from
  random on every product (Holm-adjusted p ≈ 1; lift within ±1–5% with CIs
  covering 0). Gross ROI ≈ −80…−90% (lotto), ≈ −25…−55% (Keno, high variance).
- Randomness battery (frequency, special number, repeats, autocorrelation,
  gaps, pair dispersion, sums, parity): no significant deviation after
  Bonferroni on any product. Lowest raw p: Lotto 5/35 odd/even shape 0.008
  (Bonferroni 0.065) — worth re-checking when more 5/35 data accumulates.
- What *can* be optimised:
  - **Keno**: spot level 10 has the best RTP (56.7% after tax); spot 1 worst (50%).
    Numbers chosen do not matter (fixed prizes).
  - **Jackpot games**: taxed RTP at minimum jackpot ≈ 28% (6/55), 27% (6/45),
    31% (5/35). Break-even jackpot (no sharing): ≈ 262 bn (6/55),
    78 bn (6/45), 35.8 bn (5/35).
  - **Anti-popular tickets**: same win probability, less chance of sharing a
    jackpot. Used by the suggester.
- Unseen-pool method (never-drawn combos + normal sum band + spacing rules +
  hot/cold/balanced weighting): no lift vs random in walk-forward backtest.

## Stack
Python 3.12 (`.venv`, uv) · polars · numpy · scipy · pytest ·
ECharts 5.6 (CDN) for the dashboard.

## Data
`data/*.jsonl` in this repo = own crawl (self-hosted runner in Vietnam,
07:00, 13:30 & 22:30 VN) merged with upstream `vietvudanh/vietlott-data` (cloud
fallback, 01:30 VN). Vietlott blocks non-VN IPs, so crawling cannot run on
GitHub-hosted runners. Local `vietlott-data/` clone is read-only.
- 6/55: 1,407 draws (2017-08 → ), 1 draw lacks bonus number.
- 6/45: 1,374 draws, ids start at 198 (first 197 draws missing upstream).
- 5/35: 856 draws (2025-06 → ), 2 draws/day.
- Keno: 87,291 draws after dropping 26 duplicate ids.
- No historical jackpot / prize-pool values → jackpot minimums used.

## Usage
```bash
.venv/bin/python -m src.main dashboard            # all analyses -> outputs/
.venv/bin/python -m src.main dashboard --render-only
.venv/bin/python -m src.main backtest power655 --tickets 30
.venv/bin/python -m src.main test power535
.venv/bin/python -m src.main suggest power655 -n 6
.venv/bin/python -m src.main suggest power655 --unseen   # 10 never-drawn tickets
.venv/bin/python -m src.main suggest keno -n 5
.venv/bin/python -m src.main merge-data vietlott-data/data   # union into ./data
.venv/bin/python -m pytest tests -q
bash scripts/setup_runner.sh          # install VN self-hosted runner (once)
```
Outputs: `outputs/dashboard.html` (open directly), `outputs/analysis.json`.
Dashboard views: Phân tích · Gợi ý số (Nóng/Lạnh/Ngẫu nhiên/Pattern/Mẫu lạ) ·
Tra cứu · Backtest (in-browser) · Phương pháp. Click any ticket for analysis.
After editing only `src/pipelines/web/*`, re-render with `dashboard --render-only`.
