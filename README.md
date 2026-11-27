# CodeForge

[Open CodeForge](https://retoweber.info/CodeForge/) to edit, compile, and run Eiffel, Python, C, C++, and Java. Use **Verify** for Eiffel AutoProof.

1. Choose a language.
2. Choose an example and click **Load Example**.
3. Click **Run** or **Verify**. Use **Share Code URL** to send the whole project.

The first run downloads a Linux VM. AutoProof can take several minutes in the browser.

## Run locally

~~~sh
docker compose -f docker-compose.standalone.yml up --build
~~~

Open [localhost:8000](http://localhost:8000). The local server runs code in Docker and is faster for AutoProof.

[Deploy GitHub Pages](DEPLOYMENT.md) · [Docker images](docker/README.md)
