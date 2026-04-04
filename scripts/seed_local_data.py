from __future__ import annotations

from pathlib import Path


def main() -> None:
    root = Path(".localdata/seed_export")
    (root / "memories").mkdir(parents=True, exist_ok=True)
    (root / "metadata").mkdir(parents=True, exist_ok=True)
    (root / "memories" / "example.jpg").write_bytes(b"demo")
    (root / "metadata" / "memories_history.json").write_text(
        '[{"filename":"example.jpg","capture_time":"2020-01-01T00:00:00Z"}]', encoding="utf-8"
    )
    print(f"Seeded sample export at {root}")


if __name__ == "__main__":
    main()
