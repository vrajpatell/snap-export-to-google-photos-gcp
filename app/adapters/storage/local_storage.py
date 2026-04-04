from __future__ import annotations

import shutil
from pathlib import Path


class LocalStorageAdapter:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def stage_file(self, source: Path, destination: str) -> str:
        target = self.root / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        return str(target)

    def stage_directory(self, source: Path, destination_prefix: str) -> str:
        target = self.root / destination_prefix
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)
        return str(target)
