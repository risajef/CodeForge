# Deploy CodeForge

## GitHub Pages

Enable **Settings → Pages → GitHub Actions** and run the workflow.

~~~sh
gh workflow run pages.yml
~~~

The workflow bundles the editor, examples, and Wasm toolchain. It gets the bundles from GitHub releases.

## Update the browser runtime

Use x86-64 Linux with Docker, mke2fs, and the [container2wasm QEMU assets](docker/README.md). For Podman, set `CONTAINER_ENGINE=podman`.

~~~sh
pages/prepare-runtime.sh /path/to/qemu-assets /tmp/runtime-v7
tar -C /tmp/runtime-v7 -cf /tmp/codeforge-pages-runtime-v7.tar .
~~~

For a local preview, install Jinja2 and run `python3 pages/assemble.py dist`. Copy the runtime into `dist/runtime-v7`, then serve `dist` on localhost.

Upload the archive to a new release and update the runtime version in `pages/app.js` and `.github/workflows/pages.yml` before deploying.

## Direct Wasm toolchain

Use [REIF's browser build scripts](https://github.com/risajef/reif/tree/9c99a9ec77a975cd865a496fe4b8407096b88c24/research/browser) for the compiler and verifier. Apply the [execution patch](https://github.com/risajef/CodeForge/releases/download/pages-verifier-v2/reif-browser-execution.patch) and run `research/browser/build-execution.sh /tmp/reif-browser` from the REIF checkout to include Compile and Run. For a local preview, pass the output directory to the assembler.

~~~sh
python3 pages/assemble.py dist --wasm-runtime /tmp/reif-browser
~~~

To update the toolchain, archive its contents as `codeforge-wasm-verifier.tar`, attach it to a CodeForge release, and update the default tag in `.github/workflows/pages.yml`. To test a different release once, pass its tag as `verifier_release`.
