# Himoroki

Himoroki is a modern, deployable inventory system for giving physical things identity and presence wherever they are managed.

## Development

This scaffold provides a Hono API, React Router v7 Framework Mode UI, and Neo4j connectivity.
An internal identity/persistence layer is available; Asset HTTP/UI workflows, authentication, discovery, and media storage are not implemented yet.

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

## Identity integrity

`server/identity.ts` validates structured GS1 identifier claims.
SGTIN input is `{ scheme: 'sgtin', gtin, serial }`; GTIN/JAN accepts 8, 12, 13, or 14 digits with a valid check digit and normalizes to 14 digits.
GRAI input is `{ scheme: 'grai', grai }`, where `grai` is the AI 8003 payload: zero filler, 13-digit key including its check digit, and a required individual serial.
Serials preserve case, leading zeros, and literal punctuation; they are never trimmed or URI-decoded.
A matching `{ scheme: 'gtin', gtin }` claim may accompany SGTIN but cannot identify an Asset alone.
Conflicting individual claims, mixed SGTIN/GRAI paths, unknown fields, and unsupported schemes are rejected.
These rules follow the [GS1 Syntax Dictionary](https://github.com/gs1/gs1-syntax-dictionary/blob/main/gs1-syntax-dictionary.txt) for AIs 01, 21, and 8003 and the character set in [GS1 TDS 2.3](https://ref.gs1.org/standards/tds/2.3.0/).
No URI parser, public routing shape, company-prefix inference, or identifier allocation is implemented.

`IdentityStore.open(driver)` installs and verifies uniqueness constraints before returning the store.
It owns its sessions; the caller owns the driver.
Users, Groups, and Owners use internal keys, while Assets are addressed only by their supported identifier.
Reporting requires an existing User who belongs to the explicitly selected Group; the Group receives collaboration access atomically with the Asset and identifier claim.
`reportedBy` and `reportedAt` are captured by the reporting transaction; updates accept only name and Owner changes.
Owners remain independent from Users, and new Assets are private.
The store is an internal persistence interface, not an authorization boundary: future application callers must authenticate actors and check access before reads or updates.
Direct database access is trusted; application validation and Neo4j uniqueness constraints jointly enforce integrity.

```sh
pnpm test
pnpm test:integration
```

The integration runner creates a disposable Neo4j container with a random password and localhost port, then stops it after testing.
It never uses the application `.env` or an existing database.
`NEO4J_TEST_IMAGE` may select a locally cached Neo4j 5 image; the default matches Compose's `neo4j:5-community`.

## Name

**Himoroki** comes from 神籬, now commonly read *himorogi* and historically also read *himoroki*.
A himoroki is a place or structure temporarily prepared to receive a kami: establish it where needed, and that place gains a particular purpose.
The image fits software designed to be deployed wherever an inventory system is needed, without binding it to one server, institution, or installation.

The application belongs to the **Kannabi** project.
神奈備 (*Kannabi*) evokes a place or domain associated with the presence of kami; it names the broader project context, while Himoroki names the application established within it.
This story explains the names without defining an architectural naming scheme: components should keep clear technical names.
