#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
qemu=$(realpath "${1:?Usage: prepare-runtime.sh QEMU_ASSET_DIRECTORY OUTPUT_DIRECTORY}")
output=$(realpath -m "${2:?Supply an output directory}")
engine=${CONTAINER_ENGINE:-docker}
scratch=$(mktemp -d)
cleanup() {
    if [[ -n ${container:-} ]]; then "$engine" rm "$container" >/dev/null; fi
    python3 -c 'import shutil, sys; shutil.rmtree(sys.argv[1])' "$scratch"
}
trap cleanup EXIT
mkdir -p "$output"
"$engine" build --target browser-pages-full -f "$repo/docker/Dockerfile.eiffel" -t codeforge-pages:runtime "$repo/docker"
cp "$repo/pages/guest-init.sh" "$scratch/codeforge-init"
cp "$repo/pages/guest-run.sh" "$scratch/codeforge-run"
cp "$repo/pages/guest-eiffel-cc.sh" "$scratch/codeforge-eiffel-cc"
chmod 0755 "$scratch/"codeforge-{init,run,eiffel-cc}
sed '/{% if USE_SPECIFIC_ROOT %}/,/{% else %}/d; /{% endif %}/d; s|../precomp|/precomp|' "$repo/examples/ecf_template.xml" > "$scratch/Ace.ecf"
cat > "$scratch/Dockerfile" <<'DOCKERFILE'
FROM codeforge-pages:runtime
USER root
COPY codeforge-init /usr/local/sbin/codeforge-init
COPY codeforge-run /usr/local/bin/codeforge-run
COPY codeforge-eiffel-cc /usr/local/bin/codeforge-eiffel-cc
COPY Ace.ecf /opt/codeforge/Ace.ecf
DOCKERFILE
"$engine" build -t codeforge-pages:disk "$scratch"
container=$("$engine" create codeforge-pages:disk)
"$engine" cp "$container:/library" "$scratch/library"
python3 "$repo/pages/build-library.py" "$scratch/library" "$output/library"
"$engine" export "$container" | mke2fs -q -F -t ext4 -O '^has_journal' -m 0 -d - "$scratch/eiffel.ext4" 1320M
stat -c '%s' "$scratch/eiffel.ext4" > "$output/disk-size.txt"
gzip -3 -c "$scratch/eiffel.ext4" > "$output/eiffel.ext4.gz"
cp "$qemu/"{load.js,out.js,qemu-system-x86_64.data,qemu-system-x86_64.wasm} "$output/"
if command -v wasm-strip >/dev/null; then wasm-strip "$output/qemu-system-x86_64.wasm"; fi
curl -fsSL https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js -o "$output/xterm.js"
curl -fsSL https://cdn.jsdelivr.net/npm/xterm-pty@0.10.1/index.js -o "$output/pty.js"
