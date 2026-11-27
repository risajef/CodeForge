#!/bin/sh
set -eu
language=$1
operation=$2
main=$3

if [ "$language" = eiffel ]; then
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
    apb -c_compile -batch
    if [ "$operation" = compile ]; then
        test -x ./EIFGENs/tests/W_code/autoproof-tests
    else
        exec ./EIFGENs/tests/W_code/autoproof-tests
    fi
    exit
fi

case "$language" in
    python)
        if [ "$operation" = compile ]; then exec python3 -m py_compile ./*.py; fi
        exec python3 "./$main"
        ;;
    c) gcc ./*.c -o .codeforge-program ;;
    cpp)
        set --
        for file in ./*.cpp ./*.cc ./*.cxx ./*.c; do
            if [ -f "$file" ]; then set -- "$@" "$file"; fi
        done
        g++ "$@" -o .codeforge-program
        ;;
    java)
        mkdir -p .codeforge-classes
        javac -J-Xint -J-XX:-UsePerfData -d .codeforge-classes ./*.java
        if [ "$operation" = run ]; then
            package=$(sed -nE 's/^[[:space:]]*package[[:space:]]+([a-zA-Z0-9_.]+)[[:space:]]*;.*/\1./p' "$main" | head -1)
            exec java -Xint -XX:-UsePerfData -cp .codeforge-classes "$package${main%.java}"
        fi
        ;;
esac
if [ "$operation" = run ]; then exec ./.codeforge-program; fi
