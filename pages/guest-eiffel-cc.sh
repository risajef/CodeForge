#!/bin/sh
set -eu

# Match the non-threaded Workbench flags from Reif's generated Makefiles.
workbench='-O0 -pipe -fPIC -D_GNU_SOURCE -m64 -DWORKBENCH -I/opt/eiffel/studio/spec/linux-x86-64/include -I. -I/opt/eiffel/library/base/elks/encoding/implementation/include -c'
cache=/precomp/pattern-cache
case "$*" in
    "$workbench epattern.c")
        if cmp -s epattern.c "$cache/epattern.c"; then
            printf 'Reusing the precompiled Eiffel pattern table.\n'
            exec cp "$cache/epattern.o" epattern.o
        fi
        ;;
    "$workbench eoption.c"|"$workbench efrozen.c"|"$workbench ecall.c"|"$workbench eskelet.c"|\
    "$workbench enames.c"|"$workbench evisib.c"|"$workbench eparents.c")
        # These generated translation units contain runtime data tables.
        if tcc "$@"; then exit 0; fi
        printf 'Retrying Eiffel table compilation with GCC.\n' >&2
        ;;
esac

for arg; do
    if [ "$arg" = /precomp/EIFGENs/base/W_code/preobj.o ]; then
        exec gcc -fuse-ld=mold "$@" -latomic
    fi
done

exec gcc "$@"
