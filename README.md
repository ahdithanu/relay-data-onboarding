# Relay | Customer Data Onboarding Workbench

Relay is a private customer data onboarding application. An implementation engineer imports a CSV, confirms an account schema, resolves invalid records, publishes a verified snapshot, and exports the handoff. Original uploads and release snapshots are retained separately from working data.

The product is deployed with a real server, database, object storage, and platform authentication. It is a bounded portfolio and pilot release. It now includes shared application workspaces, roles, independent approval, a generic HTTPS delivery adapter, operations visibility, and recovery controls. External customer identity, native CRM or warehouse connectors, billing, external paging, and unattended maintenance still require additional configuration or implementation. See [hardening.md](docs/hardening.md) for the exact acceptance boundaries.

## Portfolio review

Built as a forward deployed engineering portfolio project by Ahdithan Uthayakumar with AI assisted implementation. The problem is customer exports that fail a target data contract and need accountable correction before delivery.

The strongest engineering evidence is server enforced validation, workspace authorization, revision guarded mutations, immutable releases, receipt reconciliation, and verified recovery. No customer adoption or business impact is claimed.

The hosted application is currently private. Publishing this source does not grant reviewers access to the app or deploy its backend on GitHub Pages.

Start with [the reviewer guide](docs/reviewer-guide.md), then follow the demonstration below.

## Run the demonstration

1. Open the application and choose **Load demo**.
2. Review the three deliberately invalid rows in the synthetic sample.
3. Correct Atlas Robotics to `hello@atlas.example`, Meridian Health ARR to `1200`, and Vela Systems plan to `growth`.
4. Run validation. All 12 records should pass.
5. Publish a release with a meaningful review note.
6. Export the CSV and JSON manifest. The manifest carries the SHA256 checksum of the normalized records.
7. Change an ARR value, validate again, and publish a second release.
8. Roll back the active release. The registry points to the first snapshot, while both snapshots and the working data remain available.

Use verified source values for real customer imports. The three corrections above are fictional demonstration values.

## Architecture

* React 19 and TypeScript provide the working interface.
* Vinext compiles server routes and page rendering into a Cloudflare Worker.
* Sites dispatch provides ChatGPT sign in and private access. Server routes check identity and scope every data query by the authorized workspace ID.
* D1 stores project aggregates, immutable release records, and audit events.
* R2 retains the original CSV bytes in an account scoped object key.
* A deterministic validation engine enforces the schema before release.
* Atomic database batches combine a version guarded project update with conditional release and audit inserts.

See [architecture.md](docs/architecture.md) for the data model and tradeoffs, [portfolio.md](docs/portfolio.md) for interview preparation, and [pilot.md](docs/pilot.md) for the commercial experiment.

## Development

Use Node 22.13 or newer and the version of pnpm declared in package.json. Preserve the lockfile.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
```

Local preview authentication is provided by the starter only in its supported portable development profile. Hosted identity is injected by Sites. Do not deploy the Worker outside the trusted dispatcher without implementing and verifying a replacement authentication boundary. Managed development and publication should follow the Sites skills rather than running an ad hoc preview.

Generate a schema migration after a schema change:

```sh
pnpm db:generate
```

For a standalone local D1 setup, build once and apply each pending migration, in order. The command below shows the first migration; repeat it with every subsequent SQL migration in the Drizzle journal:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_wandering_jigsaw.sql
```

Never replay or rewrite applied production migrations. Sites applies the packaged migrations during publication.

## Verification

```sh
node tests/workflow.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The workflow suite executes the actual application route handlers against SQLite using the generated migrations. It substitutes the platform identity provider and R2 bindings. It covers CSV parsing, schema errors, duplicates, invalid dates, exports, tenant isolation, write origins, import idempotency, stale writes, release gates, checksums, rollback, exclusions, source retention, and concurrent mutations.

This verifies backend behavior. It is not a hosted browser or infrastructure test. The local browser reached a platform sign in route that is not provided in the test environment. Hosted browser behavior, live identity forwarding, and optional WebMCP registration remain unverified. Authentication was not weakened to work around this limitation. WebMCP is feature detected and does not block the regular interface.

## Operating limits

* Maximum 500 source rows, 30 columns, 4,000 characters per cell, and 1 MB per upload.
* Maximum 100 deployments per workspace, including trash. Aggregate project documents are bounded to 1.5 MB.
* Account contract version 1 has six required fields. ARR is denominated in USD, nonnegative, with at most two decimal places and a maximum of 1 billion.
* Valid plans are starter, growth, and enterprise. Account IDs are unique within one deployment and case sensitive.
* Email and plan values are trimmed and lowercased. Other values are trimmed. Dates must be valid ISO calendar dates.
* Validation runs synchronously within the request. Large migrations require a different execution path.
* A release updates the Relay registry. CSV and JSON exports support file handoff. A separately configured HTTPS receiver can accept an explicit delivery; registry rollback does not reverse external writes.
* Rollback changes a registry pointer. It cannot reverse an external import made from an exported file.
* Most recent 100 audit events are shown per view. Older events remain stored.
* Recovery controls support reversible trash and explicit permanent retention cleanup. Snapshots and cleanup run on demand; no background scheduler is configured.

## Secrets

This version requires no customer supplied API keys and makes no LLM calls. D1 and R2 are logical bindings declared in .openai/hosting.json. Destination credential storage uses RELAY_ENCRYPTION_KEY, and outbound destinations require RELAY_DESTINATION_ORIGINS. See docs/hardening.md for key handling and configuration. Leave destination origins empty until a receiver is approved. Keep any future secrets in the hosting secret manager, never in client code or source files.
