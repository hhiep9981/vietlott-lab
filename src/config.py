"""Game definitions, official prize tables and project paths.

Prize tables are per 10,000 VND ticket. Jackpot values are not in the
dataset (no historical prize-pool data), so the guaranteed minimum is used
and can be overridden from the CLI.

Sources (fetched 2026-10-07):
- Keno: https://onbit.vn/bai-viet/xem/xo-so-keno-vietlott-huong-dan-cach-choi-cung-co-cau-giai-thuong
- Lotto 5/35: https://vietlott.vn/vi/choi/lotto535/gioi-thieu-san-pham-535
- Power 6/55, Mega 6/45: vietlott.vn product pages
"""

from dataclasses import dataclass, field, replace
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "vietlott-data" / "data"
OUTPUT_DIR = ROOT / "outputs"

TICKET_PRICE = 10_000
SEED = 2026

# Personal income tax on lottery wins: 10% of the part above 10M VND.
TAX_THRESHOLD = 10_000_000
TAX_RATE = 0.10

# Prize key: (main_matches, special_hit). special_hit=None means "any".
PrizeTable = dict[tuple[int, bool | None], int]


@dataclass(frozen=True)
class GameConfig:
    key: str
    name: str
    file: str
    pool: int  # main numbers are 1..pool
    drawn: int  # main numbers drawn per draw
    pick: int  # main numbers on a ticket (Keno: default spot level)
    special: str | None = None  # None | "bonus" (from main pool) | "separate"
    special_pool: int = 0  # separate special number range 1..special_pool
    prizes: PrizeTable = field(default_factory=dict)
    jackpot_keys: tuple[tuple[int, bool | None], ...] = ()
    # Walk-forward windows expressed in draws (not days).
    window: int = 150

    def prize(self, matches: int, special_hit: bool) -> int:
        if (matches, special_hit) in self.prizes:
            return self.prizes[(matches, special_hit)]
        return self.prizes.get((matches, None), 0)


POWER_655 = GameConfig(
    key="power655",
    name="Power 6/55",
    file="power655.jsonl",
    pool=55,
    drawn=6,
    pick=6,
    special="bonus",
    prizes={
        (6, None): 30_000_000_000,  # Jackpot 1 (minimum, accumulates)
        (5, True): 3_000_000_000,  # Jackpot 2 (minimum, accumulates)
        (5, False): 40_000_000,
        (4, None): 500_000,
        (3, None): 50_000,
    },
    jackpot_keys=((6, None), (5, True)),
    window=150,
)

MEGA_645 = GameConfig(
    key="power645",
    name="Mega 6/45",
    file="power645.jsonl",
    pool=45,
    drawn=6,
    pick=6,
    prizes={
        (6, None): 12_000_000_000,  # Jackpot (minimum, accumulates)
        (5, None): 10_000_000,
        (4, None): 300_000,
        (3, None): 30_000,
    },
    jackpot_keys=((6, None),),
    window=150,
)

LOTTO_535 = GameConfig(
    key="power535",
    name="Lotto 5/35",
    file="power535.jsonl",
    pool=35,
    drawn=5,
    pick=5,
    special="separate",
    special_pool=12,
    prizes={
        (5, True): 6_000_000_000,  # Jackpot (minimum, accumulates)
        (5, False): 10_000_000,
        (4, True): 5_000_000,
        (4, False): 500_000,
        (3, True): 100_000,
        (3, False): 30_000,
        (2, True): 10_000,
        (1, True): 10_000,
        (0, True): 10_000,
    },
    jackpot_keys=((5, True),),
    window=150,
)

# Keno basic game: matches -> prize, per spot level (bac) 1..10.
KENO_PRIZES: dict[int, dict[int, int]] = {
    1: {1: 20_000},
    2: {2: 90_000},
    3: {2: 20_000, 3: 200_000},
    4: {2: 10_000, 3: 50_000, 4: 400_000},
    5: {3: 10_000, 4: 150_000, 5: 4_400_000},
    6: {3: 10_000, 4: 40_000, 5: 450_000, 6: 12_500_000},
    7: {3: 10_000, 4: 20_000, 5: 100_000, 6: 1_200_000, 7: 40_000_000},
    8: {0: 10_000, 4: 10_000, 5: 50_000, 6: 500_000, 7: 5_000_000, 8: 200_000_000},
    9: {
        0: 10_000,
        4: 10_000,
        5: 30_000,
        6: 150_000,
        7: 1_500_000,
        8: 12_000_000,
        9: 800_000_000,
    },
    10: {
        0: 10_000,
        5: 20_000,
        6: 80_000,
        7: 710_000,
        8: 8_000_000,
        9: 150_000_000,
        10: 2_000_000_000,
    },
}

KENO_DEFAULT_SPOT = 5

KENO = GameConfig(
    key="keno",
    name="Keno",
    file="keno.jsonl",
    pool=80,
    drawn=20,
    pick=KENO_DEFAULT_SPOT,
    prizes={(m, None): v for m, v in KENO_PRIZES[KENO_DEFAULT_SPOT].items()},
    window=1000,
)

GAMES: dict[str, GameConfig] = {
    g.key: g for g in (POWER_655, MEGA_645, LOTTO_535, KENO)
}


def keno_game(spot: int) -> GameConfig:
    """Return a Keno config for a given spot level (1..10)."""
    if spot not in KENO_PRIZES:
        raise ValueError(f"Keno spot must be 1..10, got {spot}")
    return GameConfig(
        key="keno",
        name=f"Keno (bac {spot})",
        file=KENO.file,
        pool=KENO.pool,
        drawn=KENO.drawn,
        pick=spot,
        prizes={(m, None): v for m, v in KENO_PRIZES[spot].items()},
        window=KENO.window,
    )


def with_jackpots(game: GameConfig, jackpots: list[int] | None) -> GameConfig:
    """Override jackpot values (in order of ``game.jackpot_keys``)."""
    if not jackpots:
        return game
    prizes = dict(game.prizes)
    for key, value in zip(game.jackpot_keys, jackpots):
        prizes[key] = value
    return replace(game, prizes=prizes)
