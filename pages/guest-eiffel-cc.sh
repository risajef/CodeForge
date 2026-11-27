#!/bin/sh
set -eu

# The base precompile and many projects generate the same pattern table.
# Reuse its object only for the same source and compiler options.
expected='-O0 -pipe -fPIC -D_GNU_SOURCE -m64 -DWORKBENCH -I/opt/eiffel/studio/spec/linux-x86-64/include -I. -I/opt/eiffel/library/base/elks/encoding/implementation/include -c epattern.c'
cache=/precomp/pattern-cache
if [ "$*" = "$expected" ] && cmp -s epattern.c "$cache/epattern.c"; then
    printf 'Reusing the precompiled Eiffel pattern table.\n'
    exec cp "$cache/epattern.o" epattern.o
fi

exec gcc "$@"
