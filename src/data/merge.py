"""Merge draw files from two sources (own crawl + upstream) by draw id."""

import json
from pathlib import Path

from src.config import DATA_FILES
from src.utils.log import get_logger

logger = get_logger(__name__)


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def merge_records(primary: list[dict], secondary: list[dict]) -> list[dict]:
    """Union by ``id``; on conflict the primary record wins. Sorted by date, id."""
    merged = {r["id"]: r for r in secondary}
    merged.update({r["id"]: r for r in primary})
    return sorted(merged.values(), key=lambda r: (r["date"], r["id"]))


def merge_jsonl(dst: Path, src: Path) -> int:
    """Merge ``src`` into ``dst`` in place. Returns number of records added."""
    own = read_jsonl(dst)
    other = read_jsonl(src)
    merged = merge_records(own, other)
    added = len(merged) - len({r["id"] for r in own})
    if added or not dst.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        with dst.open("w", encoding="utf-8") as f:
            for r in merged:
                f.write(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n")
    logger.info(f"{dst.name}: {len(own)} own + {len(other)} other -> {len(merged)}")
    return added


def merge_dirs(dst_dir: Path, src_dir: Path) -> dict[str, int]:
    """Merge every product file of ``src_dir`` into ``dst_dir``."""
    return {name: merge_jsonl(dst_dir / name, src_dir / name) for name in DATA_FILES}
