# Reviewer guide

## What Relay demonstrates

Relay prepares bounded account CSV imports for a controlled handoff. A user maps columns, resolves invalid records, validates the dataset, obtains independent approval when required, and creates an immutable release. The delivery adapter records receipt evidence from a configured HTTPS receiver.

## Follow the implementation

1. Read lib/domain.ts and lib/contract.ts for the data contract and validation rules.
2. Read lib/server.ts and lib/access.ts for identity, workspace isolation, and permissions.
3. Read app/api/projects/[id]/route.ts for revision guards, approval, release creation, and audit evidence.
4. Read lib/delivery.ts for encrypted credentials, delivery leases, retry limits, and uncertain outcome reconciliation.
5. Read lib/recovery.ts for checksummed backups, restore verification, and retention cleanup.
6. Read tests/workflow.mjs for executable examples of permission failures, concurrent writes, lost responses, and corrupted recovery data.

## Reproduce backend verification

Install the locked dependencies with the pnpm version declared in package.json. Use Node 22.13 or newer.

    pnpm install --frozen-lockfile
    pnpm test
    pnpm typecheck

The suite currently contains 43 checks. It executes actual route handlers and generated migrations with SQLite, simulated platform identity, simulated R2, and a receiver simulator. Passing these checks is not proof of live infrastructure behavior.

## Deployment boundary

This project uses Sites authentication, a Cloudflare Worker, D1, and R2. GitHub stores source; GitHub Pages cannot host this backend. A clone must use its own hosting resources. Do not reuse the original project's hosting identity to publish another copy.

The app trusts identity injected by the Sites dispatcher. Deploying the Worker directly requires a replacement authentication boundary. Do not expose trusted identity headers as a client controlled authentication mechanism.

## Implemented versus open

Implemented: CSV review, deterministic validation, workspace roles, independent approval, immutable releases, audit evidence, generic HTTPS delivery, operations views, and recovery controls.

Open: a live Snowflake receiver, authenticated hosted browser acceptance, external paging, scheduled backup and cleanup, and measured pilot outcomes. Snowflake is a proposed integration, not an existing connector.

## Interview demonstration

Use the synthetic sample described in README.md. Show a failed validation, a correction, a release, the exact audit evidence, and pointer rollback. Then explain the lost response test and why reconciliation is required before resending. Describe the 500 row limit before discussing scale.

Do not claim enterprise readiness, customer revenue, measured time savings, or independent implementation mastery without evidence. Be ready to modify the code and explain the consequences.
