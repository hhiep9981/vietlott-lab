"""Load Vietlott draw history into numpy-friendly structures."""

from dataclasses import dataclass

import numpy as np
import polars as pl
from src.utils.log import get_logger

from src.config import DATA_DIR, GameConfig

logger = get_logger(__name__)


@dataclass
class Draws:
    game: GameConfig
    dates: np.ndarray  # str 'YYYY-MM-DD', chronological
    ids: np.ndarray  # int draw id
    main: np.ndarray  # (n, drawn) sorted main numbers
    special: np.ndarray  # (n,) special/bonus number, -1 when absent
    onehot: np.ndarray  # (n, pool + 1) bool, column 0 unused

    def __len__(self) -> int:
        return len(self.dates)

    def tail(self, n: int) -> "Draws":
        s = slice(max(len(self) - n, 0), None)
        return Draws(
            self.game,
            self.dates[s],
            self.ids[s],
            self.main[s],
            self.special[s],
            self.onehot[s],
        )


def load_raw(game: GameConfig) -> pl.DataFrame:
    path = DATA_DIR / game.file
    try:
        df = pl.read_ndjson(path)
    except FileNotFoundError:
        logger.error(f"File not found: {path}")
        raise
    df = df.with_columns(
        pl.col("id").str.replace_all(r"\D", "").cast(pl.Int64).alias("id")
    )
    n_before = df.height
    df = df.unique(subset="id", keep="first").sort(["date", "id"])
    if df.height != n_before:
        logger.info(f"{game.name}: dropped {n_before - df.height} duplicate ids")
    return df


def load_draws(game: GameConfig) -> Draws:
    df = load_raw(game)
    results = df["result"].to_list()
    n = len(results)
    main = np.zeros((n, game.drawn), dtype=np.int16)
    special = np.full(n, -1, dtype=np.int16)
    for i, r in enumerate(results):
        main[i] = sorted(r[: game.drawn])
        if game.special and len(r) > game.drawn:
            special[i] = r[game.drawn]
    onehot = np.zeros((n, game.pool + 1), dtype=bool)
    np.put_along_axis(onehot, main.astype(np.int64), True, axis=1)
    if (onehot.sum(axis=1) != game.drawn).any():
        raise ValueError(f"{game.name}: draws with duplicate numbers found")
    missing = int((special < 0).sum()) if game.special else 0
    if missing:
        logger.warning(f"{game.name}: {missing} draws without special number")
    return Draws(
        game=game,
        dates=df["date"].to_numpy().astype(str),
        ids=df["id"].to_numpy(),
        main=main,
        special=special,
        onehot=onehot,
    )
