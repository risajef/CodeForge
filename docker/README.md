# Docker

Run this from the repo root to start the server and its five language runners.

~~~sh
docker compose -f docker-compose.standalone.yml up --build
~~~

The standalone service uses privileged Docker-in-Docker. Open [localhost:8000](http://localhost:8000).

## Eiffel

`Dockerfile.eiffel` fetches a pinned [Reif](https://github.com/CI-CSE/reif) revision and builds AutoProof. The default image includes EiffelStudio. `browser-pages-full` packages the source-built compiler and Native AOT Boogie for Pages.

The [AutoProof Docker repo](https://github.com/risajef/autoproof_docker) contains the safe and non-safe builds.

## Browser runtime

`pages/prepare-runtime.sh` expects `load.js`, `out.js`, `qemu-system-x86_64.data`, and `qemu-system-x86_64.wasm` from [container2wasm v0.8.5](https://github.com/container2wasm/container2wasm/tree/v0.8.5), built with `--external-bundle --to-js`. See [deployment](../DEPLOYMENT.md).
