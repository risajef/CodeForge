# Deploy CodeForge

## GitHub Pages

Enable **Settings → Pages → GitHub Actions** and run the workflow.

~~~sh
gh workflow run pages.yml
~~~

The workflow bundles the editor, examples, VM, and direct Wasm verifier. The runtime bundles come from GitHub releases.

## Update the browser runtime

Use x86-64 Linux with Docker, mke2fs, and the [container2wasm QEMU assets](docker/README.md). For Podman, set `CONTAINER_ENGINE=podman`.

~~~sh
pages/prepare-runtime.sh /path/to/qemu-assets /tmp/runtime-v7
tar -C /tmp/runtime-v7 -cf /tmp/codeforge-pages-runtime-v7.tar .
~~~

For a local preview, install Jinja2 and run `python3 pages/assemble.py dist`. Copy the runtime into `dist/runtime-v7`, then serve `dist` on localhost.

Upload the archive to a new release and update the runtime version in `pages/app.js` and `.github/workflows/pages.yml` before deploying.

## Direct Wasm verifier

Build the verifier with [REIF's browser build scripts](https://github.com/risajef/reif/tree/Exp-browser-autoproof/research/browser). For a local preview, pass its output directory to the assembler.

~~~sh
python3 pages/assemble.py dist --wasm-runtime /tmp/reif-browser
~~~

To update the verifier, archive its contents as `codeforge-wasm-verifier.tar`, attach it to a CodeForge release, and update the default tag in `.github/workflows/pages.yml`. To test a different release once, pass its tag as `verifier_release`. **Compile** and **Run** use the VM release configured above.
