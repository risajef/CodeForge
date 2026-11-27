"""Make the Reif library's class sources available without starting the VM."""

import shutil
import sys
from pathlib import Path

library, output = map(Path, sys.argv[1:])
output.mkdir(parents=True, exist_ok=True)
# Prefer EiffelBase if libraries contain the same filename.
paths = sorted(library.rglob("*.e"), key=lambda path: (path.relative_to(library).parts[0] != "base", path))
for path in paths:
    name = output / (path.stem.upper() + ".e")
    if not name.exists():
        shutil.copyfile(path, name)
