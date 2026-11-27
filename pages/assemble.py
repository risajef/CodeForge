"""Render the shared CodeForge interface and example catalog for GitHub Pages."""

import csv
import json
import re
import shutil
import sys
from pathlib import Path
from xml.etree import ElementTree

from jinja2 import Environment, FileSystemLoader, select_autoescape

repo = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
config = json.loads((repo / "src/config/languages.json").read_text())
templates = Environment(
    loader=FileSystemLoader(repo / "src/templates"),
    autoescape=select_autoescape(),
)
html = templates.get_template("index.html").render(
    languages=config["supported_languages"],
    default_language=config["default_language"],
    url_for=lambda _, path: "./static" + path,
    browser=True,
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
