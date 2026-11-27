# CodeForge

[Open CodeForge](https://retoweber.info/CodeForge/) to edit, compile, run, and verify Eiffel programs.

1. Choose an example and click **Load Example**.
2. Click **Run** or **Verify**. Use **Share Code URL** to send the whole project.

The GitHub Pages editor compiles, runs, and verifies Eiffel using WebAssembly workers.

## Run locally

~~~sh
docker compose -f docker-compose.standalone.yml up --build
~~~

Open [localhost:8000](http://localhost:8000). The local server runs code in Docker and is faster for AutoProof.

[Architecture](ARCHITECTURE.md) · [Deploy GitHub Pages](DEPLOYMENT.md) · [Docker images](docker/README.md)
