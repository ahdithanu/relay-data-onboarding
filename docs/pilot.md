# Commercial pilot hypothesis

## Buyer and problem

Target one narrow buyer: a B2B SaaS implementation team that repeatedly receives customer account CSVs and spends operator time cleaning them before activation. The buyer is the person accountable for onboarding throughput and launch quality.

The hypothesis is that an auditable cleanup and handoff process is valuable enough to pay for. That has not been established. A polished interface alone does not establish a market, and a CSV workflow may be too limited for many prospects.

## First offer

Offer a paid, bounded onboarding pilot: one account schema, one source type, one customer cohort, and a verified export. Scope the service around completing the migration and recording exceptions. Do not promise direct CRM integration or unattended automation in the current product.

Discuss price only after learning the operator’s current effort, the cost of a delayed launch, and the required support. Treat any initial fee as a pricing experiment rather than evidence of a market rate. Billing is handled outside this application until there is a reason to automate it.

## Discovery questions

1. Show the most recent customer export that delayed onboarding. What failed?
2. Who corrected the records, and how long did each step take?
3. What source of truth resolves uncertain values?
4. What exact destination contract is required?
5. Who approves the final handoff, and what evidence do they need?
6. Would a verified file be useful, or is a direct destination write mandatory?
7. What would make this pilot worth paying for?

## Measure the pilot

Capture baseline preparation time, number of blocking rows, number of review cycles, total elapsed time to an accepted handoff, and destination rejection count. Measure them on the same workflow and record sample size. Separate operator time from waiting time. Do not turn a tiny pilot into a generalized ROI claim.

## Decision gates

Continue if one buyer pays, the workflow is repeated, and the product removes a costly step. Add an external connector only when its destination is confirmed. If prospects need a different schema or cannot use file exports, narrow the buyer or revise the workflow before adding broad infrastructure.

For the portfolio goal, a real observed deployment and defensible engineering decisions are already useful. For a recurring software business, repeat usage, willingness to pay, support burden, and retention still need evidence.
