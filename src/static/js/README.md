# Frontend

The server and GitHub Pages share the Jinja template and JavaScript modules.

- `main.js` wires the editor, files, examples, and execution controls.
- `code-execution.js` handles compile, run, verify, cancel, and status.
- `codeforgeFetch` routes requests to FastAPI or the Pages browser VM.
- `url-compression.js` reads and creates shareable project URLs.
