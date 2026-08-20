<!-- impeccable:product-schema 1 -->

# Shark

Shark is a web-based autonomous collections operations demo. It helps an operator inspect a statistically generated portfolio, understand an account's current state and remembered history, run a guarded collection workflow, and place a real Vapi call to one consenting test recipient.

## Audience and job

The primary user is a collections operations manager evaluating which accounts need contact, why the agent recommends an action, whether the action is permitted, and what changed after an interaction.

## Required product loop

1. Explore a large synthetic portfolio generated from documented probability distributions.
2. Select an account and retrieve current state plus relevant interaction memory.
3. See a Mastra-orchestrated recommendation and its evidence.
4. Simulate an outcome publicly or unlock one real Vapi call with a private demo PIN.
5. Persist the outcome to Elasticsearch and see the next action change.

## Technology

- Next.js web application deployed on Vercel.
- Mastra tools, agent, and workflow for an auditable decision path.
- Elasticsearch versioned indices and aliases for current account state and episodic memory.
- OpenRouter for model access.
- Vapi with an imported Twilio number for outbound calls.

## Safety and scope

This is a prototype using synthetic data. It is not a production collection agency, legal-compliance product, payment processor, or authorization to contact real debtors. Live calls are restricted to a configured consenting test number. Disputes, do-not-contact records, hardship exceptions, threats, and human requests are blocked or escalated by deterministic policy.

## Visual direction

The operator surface is an evidence ledger: dense but legible, dark ink-blue, warm paper-white type, phosphor green for verified state, amber for active decisions, and red only for hard blocks. Account facts, memories, and agent inferences are visibly distinguished. The central experience is the evidence-to-action chain, not decorative charts.
