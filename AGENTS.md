# Project rules

Preserve the README naming story at the bottom of README.

- Reporting requires an explicit Group context; that Group receives collaboration access.
- A sole Group may be selected automatically in the UI, but remains explicit in the API/domain.
- `reportedBy` is immutable provenance, never an authorization grant.
- Do not introduce direct User-to-Asset ACLs.
- A public Asset's full representation is readable without authentication through its public URI; public visibility never grants edit access.
- Do not introduce per-field public/private filtering.
- Public Asset identity uses supported identifiers such as SGTIN or GRAI, never a separate application ID.
- Internal database keys remain implementation details.
- GS1 Digital Link, resolver semantics, and identifier issuance remain deferred.

# Implementation

Use Hono for server behavior, React Router v7 Framework Mode for UI, and Neo4j for master data.
Keep one package and ordinary files until a concrete need requires more structure.
Add S3-compatible media access when implementing photos, not an extension/configuration framework.
Run `pnpm typecheck`, `pnpm test`, and `pnpm build` for application changes.
Do not commit or push without explicit authorization.
