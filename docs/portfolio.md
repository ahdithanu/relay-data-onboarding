# Presenting Relay in an FDE interview

## Positioning

“I built a customer data onboarding workflow around a common deployment bottleneck: customer exports do not match the target schema. Relay retains the original file, maps the fields, surfaces deterministic validation failures, records corrections, and publishes a versioned handoff. The core engineering work is the release gate, tenant scoped access, optimistic concurrency, and recoverability.”

Use that description only after you can personally explain the implementation. Building with an assistant does not establish independent mastery. Read the relevant modules, reproduce a failing test, and make a change you can defend.

## Demonstration sequence

1. State the fictional customer’s objective: migrate account records into a consistent contract.
2. Load the sample. Explain the six target fields and three deliberate failures.
3. Attempt to publish while blocked and explain why the server enforces the gate independently of the button state.
4. Correct the three fields, rerun validation, and publish with a review note.
5. Download the manifest and explain precisely what the checksum covers.
6. Publish one changed record as a second snapshot and roll back to the first.
7. Show the original CSV and audit history to discuss source retention and operator accountability.
8. Explain current limits and the smallest extension the prospective employer’s customer would need.

The interface disables an invalid release. The API test suite demonstrates the independent server rejection. Do not imply that clicking a disabled button is an executed server test.

## Questions to prepare for

* Why a project aggregate in D1 instead of one database row per source row?
* What happens when two operators act on the same revision?
* Can an upload retry duplicate data or remove the original source?
* What is the difference between working data, a release snapshot, and the active registry pointer?
* How does the system protect records from another account?
* What would break if the identity headers were accepted from an untrusted internet client?
* Why is a checksum not an audit signature or an approval?
* How would a destination adapter handle partial success, replay, and rollback?
* How would you process ten million rows within Worker memory limits?
* Where would an LLM add value, and what evaluation would prevent invented mappings?

## Evidence you can honestly claim today

A working implementation; original source storage; a bounded data contract; server enforced quality gates; account scoped queries; a durable audit trail; immutable release snapshots; export integrity; rollback; and an executable backend test suite using the actual route handlers and generated SQLite schema.

Do not claim customer adoption, time savings, an uptime SLO, enterprise compliance, a security certification, external integrations, payment revenue, model accuracy, or large scale throughput. No such outcomes have been measured.

## Create the next proof point

Find one real implementation operator with a permitted, redacted source export. Observe the current process. Complete one migration using Relay and document the actual elapsed time, exception count, rework, and operator feedback. Let those results drive the case study.
