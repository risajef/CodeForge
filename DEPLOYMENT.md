# Deploy CodeForge

## GitHub Pages

Enable **Settings → Pages → GitHub Actions**, then run:

~~~sh
gh workflow run pages.yml
~~~

The workflow renders the shared editor, includes the example catalog, and downloads the runtime from the matching GitHub release.

## Update the browser runtime

Use x86-64 Linux with Docker or Podman, mke2fs, and the [container2wasm QEMU assets](docker/README.md).

~~~sh
pages/prepare-runtime.sh /path/to/qemu-assets /tmp/runtime-v4
tar -C /tmp/runtime-v4 -cf /tmp/codeforge-pages-runtime-v4.tar .
~~~

For a local preview, install Jinja2 and run `python3 pages/assemble.py dist`. Copy the runtime into `dist/runtime-v4`, then serve `dist` on localhost.

Upload the archive to a new release and update the runtime version in `pages/app.js` and `.github/workflows/pages.yml` before deploying.
