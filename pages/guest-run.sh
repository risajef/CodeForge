#!/bin/sh
set -eu
language=$1
operation=$2
main=$3

[ "$language" = eiffel ] || exit 1

if [ "$operation" = verify ]; then
    cp /opt/codeforge/Ace.ecf Ace.next
else
    set -- $(python3 - "$main" <<'PYTHON'
import re
import sys
from pathlib import Path

source = re.sub(r"--[^\n]*", "", Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
declaration = re.search(r"^\s*(?:(?:deferred|expanded|frozen)\s+)?class\s+(\w+)", source, re.M | re.I | re.ASCII)
if declaration:
creation = re.search(r"^\s*create\b\s*(?:\{[^}]*\}\s*)?(\w+)", source[declaration.end():], re.M | re.I | re.ASCII)
print(declaration[1], creation[1] if creation else "default_create")
PYTHON
    )
    class=${1:-}
    feature=${2:-default_create}
    if [ -z "$class" ]; then
        printf 'Select an Eiffel class as the first file.\n' >&2
        exit 1
    fi
    sed "s/<root all_classes=\"true\"\//<root class=\"$class\" feature=\"${feature:-default_create}\"\//" /opt/codeforge/Ace.ecf > Ace.next
fi
if ! cmp -s Ace.next Ace.ecf; then mv Ace.next Ace.ecf; else rm Ace.next; fi
if [ "$operation" = verify ]; then
    exec apb -batch -autoproof -html
fi
CC=/usr/local/bin/codeforge-eiffel-cc apb -c_compile -batch
if [ "$operation" = compile ]; then
    test -x ./EIFGENs/tests/W_code/autoproof-tests
else
    exec ./EIFGENs/tests/W_code/autoproof-tests
fi
