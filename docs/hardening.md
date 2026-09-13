# Production hardening record

## What this iteration adds

1. Shared application workspaces with owner, admin, operator, reviewer, and viewer permissions. Invitations are single use, expire after seven days, and bind to a verified sign in email. No invitation email is sent by the application. The Site access policy remains a separate boundary.
2. Optional independent release approval. A reviewer must differ from the last data editor. Data changes and validation reruns invalidate the prior approval. Publication checks the normalized records and the exact validation contract again.
3. An authenticated HTTPS receiver adapter. Approved origins are configured by the host operator. Credentials are encrypted with AES GCM and bound to the workspace. Requests have deadlines, redirects are not followed, sends have a bounded attempt count, and uncertain responses require reconciliation.
4. Request IDs, structured logs, durable request traces, failure counts, latency summaries, dependency checks, and an incident view. The dashboard refreshes while open. No external pager or notification destination has been connected.
5. On demand project snapshots, checksums for each object, restore into a new deployment, streamed recovery bundles, an independent offline verification utility, reversible trash, and explicit retention cleanup. Cleanup prevents a deployment from being restored while it is being purged.
6. Exact field and mapping changes in audit evidence, source checksums, contract snapshots and hashes, reviewer identity, release operator identity, project revisions, and request references.

## Verification evidence

The actual route handlers and generated SQLite migrations are exercised by tests/workflow.mjs. The test environment supplies a substitute platform identity provider, an in memory R2 implementation, and a receiver simulator for network failure tests. The suite covers the original workflow plus independent review, invitation roles, revoked membership, encrypted credentials, origin restrictions, delivery receipts, lost responses, corrupted backups, recovery, retention concurrency, and offsite bundle verification.

These tests are not equivalent to a real hosted browser test, actual receiver integration, or a full infrastructure outage drill.

A browser attempt reached the local sign in redirect. The local test server does not provide the platform owned sign in route and returned 404. The available Sites browser workflow does not support navigation to the deployed Site. Authentication was not changed to get around that boundary. Therefore authenticated browser QA, responsive interaction QA, and WebMCP validation remain blocked in this environment.

The native database inspection confirmed the original live D1 binding and schema before the changes. A deployment status and schema inspection establish publication and migration status, not workflow behavior.

## Remaining configuration and acceptance gates

* Choose and connect an actual destination. The current adapter speaks the receiver contract in receiver-contract.md; it is not a native Salesforce or Snowflake connector.
* Confirm hosted sign in, form submission, persistence across reload, download behavior, mobile use, reviewer handoff, and recovery using an authenticated user session.
* Grant Site access separately before a real invitee can reach the app. Creating an application invitation does not widen the Site audience.
* Choose an external paging destination and a monitored notification path. In app incidents alone will not wake an operator.
* Schedule backup and cleanup jobs in a supported execution environment. This version deliberately runs them on demand. It does not provide unattended maintenance.
* Place recovery bundles and the required source/configuration recovery materials in independently controlled storage. Snapshots in the same R2 service are not full disaster recovery.
* Exercise a full environment rebuild. The offline utility verifies and extracts archived objects; it does not automatically provision a replacement cloud environment or restore platform identity and secrets.
* Measure actual hosted throughput before accepting a service level or a larger workload. Large histories need durable jobs and checkpointed restoration rather than long synchronous requests.

## Recovery procedure

Create a snapshot from Workspace controls, Recovery. Download its recovery bundle to independently controlled storage. Test it without the hosting provider:

```sh
node scripts/verify-recovery.mjs recovery.ndjson fresh-recovery-directory
```

The utility verifies every hash, size, unique object key, and the completion marker. It creates a new output directory containing the original CSV, project document, manifest, and a SQLite archive of all verified objects. It refuses to overwrite an existing directory. It does not write to production.

For an application restore, use Restore copy. All object checks run before any recovered project is created. The restored deployment gets new IDs, preserves snapshots and audit provenance, and starts with validation required. The original deployment is not overwritten.

Cleanup is explicit. It permanently removes expired trash and snapshots, old request traces, and orphaned source objects older than 24 hours. The source scan is bounded; a limited scan is reported in the workspace event. Keep long term audit evidence in recovery bundles before applying retention deletion.

## Secret lifecycle

RELAY_ENCRYPTION_KEY must contain a cryptographically random 32 byte key in base64, stored as a hosting secret. Do not rotate it without reencrypting existing destination credentials; losing it makes those credentials unreadable. Keep recovery of this key separate from downloadable data bundles.

RELAY_DESTINATION_ORIGINS is a comma separated list of exact approved HTTPS origins. An empty list disables destination configuration. Changing a receiver for a workspace with delivery history is rejected to prevent silently redirecting an existing delivery. Token rotation at the same destination is supported.
