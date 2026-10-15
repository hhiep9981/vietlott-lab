"""Append-only log of published next-draw pools (data/pool_log.jsonl)."""

import json
from pathlib import Path

from src.data.merge import read_jsonl
from src.utils.log import get_logger

logger = get_logger(__name__)


def append_pool(path: Path, record: dict) -> bool:
    """Append ``record`` unless (game, after_id) is already logged."""
    key = (record["game"], record["after_id"])
    if any((r["game"], r["after_id"]) == key for r in read_jsonl(path)):
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    logger.info(f"Pool logged: {key[0]} after draw #{key[1]}")
    return True


def game_log(path: Path, game: str) -> list[dict]:
    """Logged pools of one game, oldest first."""
    return sorted(
        (r for r in read_jsonl(path) if r["game"] == game),
        key=lambda r: r["after_id"],
    )
