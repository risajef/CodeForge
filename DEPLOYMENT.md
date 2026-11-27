# Deploy CodeForge

## GitHub Pages

Enable **Settings → Pages → GitHub Actions** and run the workflow.

~~~sh
gh workflow run pages.yml
~~~

The workflow renders the shared editor, includes the example catalog, and downloads the runtime from the matching GitHub release.

## Update the browser runtime

Use x86-64 Linux with Docker, mke2fs, and the [container2wasm QEMU assets](docker/README.md). For Podman, set `CONTAINER_ENGINE=podman`.

~~~sh
pages/prepare-runtime.sh /path/to/qemu-assets /tmp/runtime-v7
tar -C /tmp/runtime-v7 -cf /tmp/codeforge-pages-runtime-v7.tar .
~~~

For a local preview, install Jinja2 and run `python3 pages/assemble.py dist`. Copy the runtime into `dist/runtime-v7`, then serve `dist` on localhost.

Upload the archive to a new release and update the runtime version in `pages/app.js` and `.github/workflows/pages.yml` before deploying.
