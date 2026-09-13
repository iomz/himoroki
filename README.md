# Himoroki

Himoroki is a modern, deployable inventory system for giving physical things identity and presence wherever they are managed.

## Development

This scaffold provides a Hono API, React Router v7 Framework Mode UI, and Neo4j connectivity.
Asset reporting, authentication, authorization, discovery, and media storage are not implemented yet.

Use Node 24 and pnpm 10.32.0.
Copy `.env.example` to `.env` and set a local Neo4j password, then run:

```sh
pnpm install
docker compose up -d neo4j
pnpm dev
```

Open the Vite URL printed in the terminal.
The UI calls Hono through Vite's `/api` proxy; Hono connects to Neo4j.
`GET /api/health` checks process liveness; `GET /api/ready` returns 503 until Neo4j is reachable.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

The built application serves UI and API on port 3000 by default.
For the containerized scaffold, run `docker compose up --build` after configuring `.env`.
Compose binds published ports to localhost and persists Neo4j data in a named volume.
S3-compatible storage will be wired when Asset photos are implemented; Alarik is the preferred initial backend.

## Name

**Himoroki** comes from 神籬, now commonly read *himorogi* and historically also read *himoroki*.
A himoroki is a place or structure temporarily prepared to receive a kami: establish it where needed, and that place gains a particular purpose.
The image fits software designed to be deployed wherever an inventory system is needed, without binding it to one server, institution, or installation.

The application belongs to the **Kannabi** project.
神奈備 (*Kannabi*) evokes a place or domain associated with the presence of kami; it names the broader project context, while Himoroki names the application established within it.
This story explains the names without defining an architectural naming scheme: components should keep clear technical names.
