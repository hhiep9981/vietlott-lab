# Vietlott Lab

Statistical research on four Vietlott products — **Power 6/55, Mega 6/45,
Lotto 5/35, Keno** — with a static HTML dashboard.

**Dashboard:** https://hhiep9981.github.io/vietlott-lab/

## What it does
- **Randomness tests** (8 per product): number frequency, special number,
  repeats, autocorrelation, gap distribution, pair co-occurrence, sums,
  odd/even.
- **Walk-forward backtest** of 9 number-selection strategies (hot, cold,
  not-repeat, exponential decay, long absence, Markov chain, pair frequency,
  gap pattern, random) with official prize tables, t-tests vs random and
  Holm correction.
- **Expected value**: exact odds, return-to-player, break-even jackpot,
  Keno RTP by spot level.
- **Ticket suggestions**: anti-popular, diversified tickets (same odds,
  lower chance of sharing a jackpot).

## Findings (Oct 2026)
- No product shows a statistically significant deviation from fair draws.
- No strategy beats random picking (0/9 on every product).
- Only real levers: Keno spot 10 has the best RTP (56.7% after tax);
  jackpot games are +EV only above the break-even jackpot (≈262 bn VND for
  6/55, 78 bn for 6/45, 35.8 bn for 5/35, ignoring sharing); avoid popular
  combinations.

See [docs/PROJECT.md](docs/PROJECT.md) for details.

## Run locally
Data comes from [vietvudanh/vietlott-data](https://github.com/vietvudanh/vietlott-data),
cloned next to `src/`:

```bash
git clone https://github.com/vietvudanh/vietlott-data.git
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python -m src.main dashboard        # -> outputs/dashboard.html
.venv/bin/python -m src.main suggest power655 -n 6
.venv/bin/python -m pytest tests -q
```

## Disclaimer
For research and education only. Lottery draws are random and have negative
expected value; nothing here increases the probability of winning.
