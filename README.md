# Himoroki

Himoroki is a modern, deployable inventory system for giving physical things identity and presence wherever they are managed.

## Development

Hono serves the API, React Router v7 Framework Mode provides the UI, and Neo4j stores domain and authentication data.
The first flow supports local sign-up/sign-in/sign-out, Group membership, and reporting, photographing, viewing, editing, and finding Assets with existing identifiers.

Use Node 24 and pnpm 10.32.0.
For a fresh full local deployment, generate credentials and start the app, Neo4j, and Alarik:

```sh
pnpm setup:env
docker compose up -d --build --wait
```

Open `http://127.0.0.1:3000` after startup.
The helper uses only Node built-ins and can also run as `node scripts/setup-env.mjs` before installing dependencies.
It creates `.env` in the current directory with independent random credentials and owner-only permissions on POSIX systems, never prints secrets, and refuses to overwrite an existing file.
It does not start services or rotate credentials in existing storage volumes.
Keep an existing deployment's `.env`; generating new credentials does not update Neo4j or Alarik's stored credentials.
For custom configuration, use `.env.example` as a reference.

For local Node/Vite development with containerized dependencies, use this alternative on a fresh checkout:

```sh
pnpm setup:env --dev
pnpm install
docker compose up -d --wait neo4j alarik
pnpm dev
```

Open `http://127.0.0.1:3000` after Vite and Hono start; this is the canonical Himoroki application origin in development.
For an existing local `.env`, set `APP_URL=http://127.0.0.1:3000` without replacing its stored credentials.
React Router/Vite may also print `http://127.0.0.1:5173`, but that listener is development tooling rather than the Himoroki browser entry point.
Hono connects to Neo4j.
Startup requires Neo4j and an accessible private S3 bucket; it installs uniqueness constraints before listening.
`GET /api/health` checks process liveness; `GET /api/ready` returns 503 if Neo4j becomes unreachable.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

The built application serves UI and API on port 3000 by default.
For the containerized application, run `docker compose up --build` after configuring `.env`.
Compose binds published ports to localhost and persists Neo4j data in a named volume.
[Alarik](https://github.com/achtungsoftware/alarik) is the default development object store, pinned to `1.0.0-beta-16`.
Compose creates a private `himoroki-photos` bucket and keeps bytes in its own named volume.
Alarik credentials and default bucket are seeded on first startup; changing environment values does not rotate existing stored credentials.
To use another S3-compatible backend, configure `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY` and provision a private bucket before starting Himoroki.
The application needs HeadBucket, PutObject, GetObject, and DeleteObject access; it does not depend on Alarik administration APIs.

## Development/demo dataset

The demo tools create 140 entirely synthetic Assets, three local email/password accounts, four Groups, three Owners, and 47 photos using three bundled illustrations.
Names, supported identifiers, relationships, and visibility are deterministic; internal keys, password hashes, and immutable reporting timestamps are generated normally.
The 70 SGTIN and 70 GRAI values are checksum-valid synthetic examples, not identifiers for real inventory.
Search by name using terms such as `camera`, `bench`, `studio`, or `backpack`; Owners appear in Asset details.

Run the tools on the host with Node 24, installed dependencies (`pnpm install`), and your existing local `.env` credentials.
For a fresh checkout, create `.env` with `pnpm setup:env --dev` first.
Stop `pnpm dev`/`pnpm start` before seeding, or stop the Compose app as below; leave Neo4j and Alarik running.

```sh
docker compose stop app
docker compose up -d --wait neo4j alarik
HIMOROKI_DEMO=local pnpm demo:seed
```

Seed requires empty application data and an empty media bucket; an initialized Settings node is allowed and receives optional-photo/UTC defaults.
A repeated seed fails without modifying the existing dataset rather than duplicating it.

**Reset permanently deletes all application data in the configured Neo4j database and every object in the configured `himoroki-photos` bucket, including data you created yourself, before recreating the demo.**
It preserves database schema, bucket configuration, and infrastructure credentials.
To replace an existing local development dataset yourself, stop the app and run:

```sh
HIMOROKI_DEMO=local pnpm demo:reset -- --yes
```

Both commands require explicit `HIMOROKI_DEMO=local` opt-in, non-production `NODE_ENV`, an HTTP loopback `APP_URL`, a direct loopback `bolt://` Neo4j endpoint, and a loopback HTTP S3 endpoint using the dedicated `himoroki-photos` bucket.
Use the default local Alarik setup; container service names, remote hosts, and wildcard addresses are rejected.
Demo commands also require object listing and bucket-versioning inspection permissions; enabled or suspended bucket versioning is rejected so reset cannot leave hidden media versions.
The opt-in asserts that these are dedicated, disposable development services: do not use forwarded remote ports or shared stores.
The tools refuse a responding application port; stop any other processes connected to the same stores and do not run demo commands concurrently.
If reset or seed fails partway through, keep the app stopped, fix the reported cause, and rerun the confirmed reset; database and object-storage changes cannot commit atomically together.

Resume `pnpm dev`, or `docker compose up -d --build app` for the full local deployment, with `APP_URL=http://127.0.0.1:3000`.
Use the same local configuration and infrastructure credentials as before.
All demo accounts use password **`Himoroki-demo-only-2026!`**; never expose this dataset or these credentials on a public deployment.

| Account | Role | All | Mine | Group access | Public |
| --- | --- | ---: | ---: | ---: | ---: |
| `evaluator@demo.invalid` | System administrator | 124 | 64 | 120 | 34 |
| `collaborator@demo.invalid` | Shared-Group collaborator | 88 | 56 | 72 | 34 |
| `outsider@demo.invalid` | Unrelated Group member | 50 | 20 | 20 | 34 |

Counts above apply before searching or editing; scopes overlap.
The evaluator cannot read 16 private Assets in Private Store, despite being a system administrator.
Mine filters immutable reporting provenance within readable Assets and grants no access.
The evaluator can open Administration → Members and Settings; the other accounts cannot.
The tools add no demo fields or relationships to the domain model.
`pnpm test:integration` verifies seed and destructive reset on disposable Neo4j and Alarik containers only.

## Identity integrity

`server/identity.ts` validates structured GS1 identifier claims.
SGTIN input is `{ scheme: 'sgtin', gtin, serial }`; GTIN/JAN accepts 8, 12, 13, or 14 digits with a valid check digit and normalizes to 14 digits.
GRAI input is `{ scheme: 'grai', grai }`, where `grai` is the AI 8003 payload: zero filler, 13-digit key including its check digit, and a required individual serial.
Serials preserve case, leading zeros, and literal punctuation; they are never trimmed or URI-decoded.
A matching `{ scheme: 'gtin', gtin }` claim may accompany SGTIN but cannot identify an Asset alone.
Conflicting individual claims, mixed SGTIN/GRAI paths, unknown fields, and unsupported schemes are rejected.
These rules follow the [GS1 Syntax Dictionary](https://github.com/gs1/gs1-syntax-dictionary/blob/main/gs1-syntax-dictionary.txt) for AIs 01, 21, and 8003 and the character set in [GS1 TDS 2.3](https://ref.gs1.org/standards/tds/2.3.0/).
Asset links use `/asset?scheme=sgtin&gtin=...&serial=...` or `/asset?scheme=grai&grai=...`, with query values URL-encoded.
These links carry the canonical supported identifier; they do not implement GS1 Digital Link, company-prefix inference, or identifier allocation.

`IdentityStore.open(driver)` installs and verifies uniqueness constraints before returning the store.
It owns its sessions; the caller owns the driver.
Users, Groups, and Owners use internal keys, while Assets are addressed only by their supported identifier.
Reporting requires an existing User who belongs to the explicitly selected Group; the Group receives collaboration access atomically with the Asset and identifier claim.
`reportedBy` and `reportedAt` are captured by the reporting transaction; updates accept only name, Owner, and public visibility changes.
Owners remain independent from Users, and new Assets are private.
The API obtains the actor from the authenticated session; store reads and mutations check current Group membership in Neo4j.
Store actor arguments are trusted internal inputs, never accepted from request bodies.
Direct database access is trusted; application validation and Neo4j uniqueness constraints jointly enforce integrity.

## Authentication and Group access

[Better Auth](https://better-auth.com/docs/integrations/hono) handles passwords, sessions, cookies, and local authentication.
Its [listed community Neo4j adapter](https://better-auth.com/docs/adapters/community-adapters), `neo4j-better-auth`, persists authentication in the existing database.
Authentication uses the same `User` nodes as domain provenance, with a server-assigned domain key; account and session records use separate labels.
This avoids a second application database and a custom authentication adapter.
The adapter and Better Auth versions are pinned; upgrades must pass the real Neo4j integration tests.

Create an account, open Groups from the sidebar to create a Group or ask an existing member to add your member key, then report an Asset from the Assets workspace.
The persistent header searches accessible Assets by name on Enter; ⌘K or Ctrl+K focuses search and Escape blurs it.
The account menu provides Profile and sign-out.
Profile lets signed-in Users update their display name; email remains read-only.
Administration → Members lists registered accounts and lets system administrators edit names and administrator status.
The final administrator cannot be revoked; concurrent role changes are serialized in Neo4j.
Profile edits retain User identity and reporting provenance, and administration grants no Asset access.
The Assets workspace shows compact photo rows and loads more inventory as you scroll.
All, Mine, Group access, and Public filter readable Assets; their overlapping counts reflect the current search.
Mine means originally reported by you and never grants access.
Identifiers, ownership, and photos remain within each Asset workflow.
Any current Group member can add an existing User; Users can leave their own Groups.
A sole Group is selected automatically, but reporting always sends an explicit Group key.
Group members can read and edit its private Assets.
`reportedBy` grants no access and remains unchanged after the reporter leaves the Group.
Marking an Asset public permits anyone with its identifier link to read the full Asset representation, never to edit it.
New Assets are private, and there are no direct User-to-Asset ACLs.

`GET /api/assets` keeps case-insensitive name-substring search through `q` and returns `assets`, `total`, `matching`, `scopes`, and `nextCursor`.
Counts include only Assets the signed-in User can read; pages default to 30 entries, with `limit` between 1 and 100.
Pass `nextCursor` as `cursor` with the same `q` and `scope` to continue; a null cursor ends the results.
`scope` accepts `all` (default), `mine`, `group`, or `public`; the response includes matching counts for every scope.
Ordering remains name followed by supported identifier; each request checks current access and data rather than holding an inventory snapshot.

Unsafe API requests require an Origin matching `APP_URL`.
Better Auth rate limiting uses the TCP peer address set by the Node server; forwarded client IP headers are not trusted, so clients behind one reverse proxy share its rate-limit bucket.
Authentication routes are limited to sign-up, sign-in, sign-out, and session lookup.
External identity providers and identifier issuance remain deferred.

## Photos and administration

Photos may accompany reporting or be uploaded later from the Asset page.
Supported uploads are JPEG, PNG, and WebP, up to 10 MiB each.
Bytes remain in the private bucket; Neo4j stores photo metadata and Asset relationships.
Photo retrieval always passes through the API and checks current Asset access, including public visibility.
Responses are not cached, so making an Asset private blocks subsequent anonymous photo requests.
Previously downloaded copies cannot be recalled.

Administration is explicitly granted by an operator after an account signs up:

```sh
pnpm admin:grant person@example.com
```

For the containerized application, use `docker compose exec app node dist/server/grant-admin.js person@example.com`.
Reload the application and open Settings under Administration in the sidebar to see Instance settings.
Administration permits changing only the photo-on-report policy and the instance display timezone; it grants no Asset access.
The defaults are optional photos and UTC display.
The photo requirement applies to new reports, including direct API requests, and requires a photo in the same reporting submission.
Existing Assets remain editable without a photo when the policy changes.
All stored timestamps remain absolute instants; the configured timezone only affects presentation.

Uploads reserve a short-lived metadata record before storing bytes.
The Asset and photo relationship commit together only after storage succeeds.
Failure cleanup removes bytes while retaining a retry record through the ten-minute upload lease, covering delayed storage responses.
Expired or failed uploads are retried on startup and every minute; attached photos are excluded.
If storage is unavailable, cleanup waits for recovery and the pending photo is never exposed as an Asset photo.

To evaluate an empty deployment, sign up, create a Group or join through an existing member, report an Asset with an existing identifier, upload/view a photo, edit its name, switch public/private visibility, and find it again by name.
Enable the photo requirement and select a display timezone from Instance settings to exercise deployment policy.

## Tests

```sh
pnpm test
pnpm test:setup
pnpm test:integration
```

The integration runner creates a disposable Neo4j container per suite and an Alarik container for media tests with a random password and localhost port, then stops it after testing.
Tests cover canonicalization, conflicting claims, transactional and concurrent duplicate rejection, persisted authentication, explicit Group reporting, private/public authorization, immutable provenance after membership removal, signed S3 operations, photo authorization, policy enforcement, timezone presentation, and upload-failure cleanup.
It never uses the application `.env` or an existing database.
`NEO4J_TEST_IMAGE` may select a locally cached Neo4j 5 image; the default matches Compose's `neo4j:5-community`.

## Name

**Himoroki** comes from 神籬, now commonly read *himorogi* and historically also read *himoroki*.
A himoroki is a place or structure temporarily prepared to receive a kami: establish it where needed, and that place gains a particular purpose.
The image fits software designed to be deployed wherever an inventory system is needed, without binding it to one server, institution, or installation.

The application belongs to the **Kannabi** project.
神奈備 (*Kannabi*) evokes a place or domain associated with the presence of kami; it names the broader project context, while Himoroki names the application established within it.
This story explains the names without defining an architectural naming scheme: components should keep clear technical names.
