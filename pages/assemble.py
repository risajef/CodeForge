"""Render the shared CodeForge interface and example catalog for GitHub Pages."""

import argparse
import csv
import json
import re
import shutil
from pathlib import Path
from xml.etree import ElementTree

from jinja2 import Environment, FileSystemLoader, select_autoescape

repo = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
parser.add_argument("--wasm-runtime", type=Path, help="Directory built by REIF's browser build scripts")
parser.add_argument("--wasm-version", help="Version appended to the runtime URL")
args = parser.parse_args()
output = args.output
wasm_folder = "wasm-verifier"
if args.wasm_version:
    if not re.fullmatch(r"[A-Za-z0-9._-]+", args.wasm_version):
        parser.error("Invalid Wasm runtime version")
    wasm_folder += "-" + args.wasm_version
execution_entry = "execution/run-project.mjs"
has_execution = args.wasm_runtime is not None and (args.wasm_runtime / execution_entry).is_file()
if args.wasm_runtime is not None:
    required = (
        "verify-project.mjs", "compiler-worker.js", "ecb.js", "ecb.wasm", "ecb.data",
        "boogie/solver-worker.js", "boogie/_framework/dotnet.js", "boogie/z3/z3-built.wasm",
    )
    if has_execution:
        required += tuple("execution/" + name for name in (
            "link-worker.mjs", "clang-worker.mjs", "program-worker.mjs", "headers.tar.gz",
            "clang.js", "clang.wasm", "lld.js", "lld.wasm", "x2c.mjs", "x2c.wasm", "runner.mjs", "runner.wasm",
        ))
    missing = [name for name in required if not (args.wasm_runtime / name).is_file()]
    if missing:
        parser.error("Incomplete Wasm runtime: " + ", ".join(missing))


output.mkdir(parents=True, exist_ok=True)
config = json.loads((repo / "src/config/languages.json").read_text())
templates = Environment(
    loader=FileSystemLoader(repo / "src/templates"),
    autoescape=select_autoescape(),
)
html = templates.get_template("index.html").render(
    url_for=lambda _, path: "./static" + path,
    browser=True,
    wasm_verifier=f"./{wasm_folder}/verify-project.mjs" if args.wasm_runtime is not None else None,
    wasm_execution=f"./{wasm_folder}/{execution_entry}" if has_execution else None,
    wasm_version=args.wasm_version,
)

# Cross-origin resources need CORS when the browser isolates the VM.
html = re.sub(r"<(link|script)(\s[^>]+https://)", r'<\1 crossorigin="anonymous"\2', html)
(output / "index.html").write_text(html, encoding="utf-8")
shutil.copytree(repo / "src/static", output / "static", dirs_exist_ok=True)
for name in ("app.js", "coi.js", "sources.html", "style.css"):
    shutil.copyfile(repo / "pages" / name, output / name)

examples = {}
for language in config["supported_languages"]:
    with (repo / "examples" / f"{language}_examples.csv").open(encoding="utf-8", newline="") as source:
        examples[language] = {row["name"]: row["url"] for row in csv.DictReader(source)}

(output / "examples.json").write_text(json.dumps(examples), encoding="utf-8")
mappings = ElementTree.parse(repo / "src/config/eiffel_mappings.xml")
(output / "mappings.json").write_text(json.dumps({
    node.attrib["old_name"].upper(): node.attrib["new_name"].upper()
    for node in mappings.findall("mapping")
}), encoding="utf-8")

if args.wasm_runtime is not None:
    shutil.copytree(args.wasm_runtime, output / wasm_folder, dirs_exist_ok=True)
    ecf = (repo / "examples/ecf_template.xml").read_text(encoding="utf-8")
    ecf = templates.from_string(ecf).render(USE_SPECIFIC_ROOT=False)
    ecf = re.sub(
        r"<precompile\b[^>]*></precompile>",
        '<library name="base" location="$ISE_LIBRARY/library/base/base.ecf"/>',
        ecf,
        count=1,
    )
    (output / "autoproof.ecf").write_text(ecf, encoding="utf-8")
