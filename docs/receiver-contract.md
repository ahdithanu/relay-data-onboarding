# Relay destination receiver contract

The included connector sends to an authenticated HTTPS receiver implementing this contract. It is a generic delivery adapter, not a native CRM or warehouse integration.

## Required endpoint behavior

The configured base URL is an approved HTTPS origin with an optional path prefix. Credentials are sent as a Bearer authorization header. Redirects are not followed.

POST BASE/releases receives:

```json
{
  "schemaVersion": 1,
  "releaseId": "opaque UUID",
  "checksum": "SHA256 of the ordered normalized records JSON",
  "recordCount": 12,
  "contract": {},
  "records": []
}
```

The request includes Idempotency-Key equal to releaseId and X-Relay-Checksum equal to checksum. The receiver must atomically deduplicate writes by releaseId and reject reuse of the ID with different content. Compute and check the checksum before commit.

Successful POST and GET BASE/releases/RELEASE_ID must return the same durable receipt:

```json
{
  "status": "committed",
  "receiptId": "receiver assigned durable ID",
  "releaseId": "the exact submitted release ID",
  "checksum": "the exact committed checksum",
  "recordCount": 12
}
```

A receipt must be available only after all records are durably committed, or after an equivalent atomic activation mechanism. Partial success must not be called committed. Preserve the receipt for at least as long as Relay may reconcile or retry the release.

GET must be strongly consistent with committed receipts. A 404 must mean the release was not committed. Otherwise a lost response could cause an unsafe retry. The receiver must still deduplicate repeated POST requests even after a 404 lookup.

## Sender behavior

The sender imposes a ten second request deadline, a receipt size limit of 64 KB, and a 45 second lease against simultaneous delivery work. It allows at most five send attempts per release. Retry eligibility uses bounded backoff.

A lost response, server error, redirect, or mismatched receipt leaves the delivery uncertain. The operator reconciles by reading the receiver receipt. A confirmed absence permits another send after the retry time. Authentication rejection is surfaced as failed so the operator can correct credentials and reconcile.

There is no automatic background delivery runner. Queue, send, and reconcile are explicit application actions. Relay rollback affects its registry pointer only; external reversal requires a destination specific compensation design.

## Integration acceptance test

Use synthetic records first. Demonstrate first delivery, repeated POST, response loss after commit, receipt reconciliation, absent receipt, malformed receipt, rejected credentials, timeout, and destination rejection. Confirm the destination row count and business keys directly. Then agree on the required treatment of updates, deletes, partial success, and customer account scoping before using production records.
