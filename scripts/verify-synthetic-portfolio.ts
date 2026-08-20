import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  DEFAULT_PORTFOLIO_SEED,
  DEFAULT_PORTFOLIO_SIZE,
  generateSyntheticPortfolio,
  type CustomerSegment,
  type SyntheticAccount,
} from "../src/lib/collections";

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const average = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const meanBalanceFor = (
  accounts: readonly SyntheticAccount[],
  segment: CustomerSegment,
) =>
  average(
    accounts
      .filter((account) => account.segment === segment)
      .map((account) => account.originalBalanceCents),
  );

const portfolio = generateSyntheticPortfolio();
const repeated = generateSyntheticPortfolio();
const alternate = generateSyntheticPortfolio({
  seed: DEFAULT_PORTFOLIO_SEED + 1,
});
const { accounts, memories, summary } = portfolio;

assert.equal(accounts.length, DEFAULT_PORTFOLIO_SIZE);
assert(accounts.length >= 1_500, "portfolio must contain at least 1,500 accounts");
assert.equal(new Set(accounts.map((account) => account.id)).size, accounts.length);
assert.equal(new Set(memories.map((memory) => memory.id)).size, memories.length);
assert(
  accounts.every((account) => account.synthetic),
  "every account must be explicitly synthetic",
);
assert(
  accounts.every((account) => /^\+1000\d{7}$/.test(account.phoneNumber)),
  "all phone numbers must use the deliberately invalid +1 000 demo range",
);
assert.equal(
  new Set(accounts.map((account) => account.phoneNumber)).size,
  accounts.length,
  "synthetic phone numbers must remain unique",
);
assert(
  accounts.every((account) => account.email.endsWith("@invalid.example")),
  "all emails must use a reserved non-deliverable domain",
);

const accountIds = new Set(accounts.map((account) => account.id));
assert(
  memories.every(
    (memory) => memory.synthetic && accountIds.has(memory.accountId),
  ),
  "every memory must reference a synthetic account",
);
const memoriesByAccount = new Map<string, number>();
for (const memory of memories) {
  memoriesByAccount.set(
    memory.accountId,
    (memoriesByAccount.get(memory.accountId) ?? 0) + 1,
  );
}
assert(
  accounts.every((account) => (memoriesByAccount.get(account.id) ?? 0) >= 3),
  "every account must have several memory events",
);

assert.equal(
  digest(portfolio),
  digest(repeated),
  "the same seed must reproduce the exact portfolio",
);
assert.notEqual(
  digest(portfolio),
  digest(alternate),
  "different seeds must produce different portfolios",
);

assert(
  summary.segmentShares.consumer > 0.77 &&
    summary.segmentShares.consumer < 0.87,
  "consumer segment share drifted outside its expected interval",
);
assert(
  summary.stageShares.severe > 0.24 && summary.stageShares.severe < 0.36,
  "severe delinquency share drifted outside its expected interval",
);
assert(
  summary.disputeRate > 0.04 && summary.disputeRate < 0.16,
  "dispute prevalence drifted outside its expected interval",
);
assert(
  summary.hardshipRate > 0.1 && summary.hardshipRate < 0.28,
  "hardship prevalence drifted outside its expected interval",
);
assert(
  summary.doNotContactRate > 0.015 && summary.doNotContactRate < 0.11,
  "do-not-contact prevalence drifted outside its expected interval",
);
assert(
  summary.phoneConsentRate > 0.58 && summary.phoneConsentRate < 0.9,
  "phone-consent prevalence drifted outside its expected interval",
);
assert(
  summary.promiseShares.none > 0.45 && summary.promiseShares.none < 0.86,
  "promise behavior prevalence drifted outside its expected interval",
);
assert(
  summary.correlations.daysPastDueToRisk > 0.55,
  "risk should rise materially with delinquency age",
);
assert(
  summary.correlations.daysPastDueToContactability < -0.2,
  "contactability should fall as delinquency ages",
);
assert(
  meanBalanceFor(accounts, "small_business") >
    meanBalanceFor(accounts, "consumer") * 3,
  "small-business balances should be materially larger than consumer balances",
);
assert(summary.balances.p90 > summary.balances.p50 * 2);
assert(summary.memoriesPerAccount.mean >= 4);
assert(summary.totalOutstandingCents > 0);
assert(summary.totalRecoveredCents > 0);

console.log("Synthetic portfolio verification passed.");
console.table({
  accounts: summary.accountCount,
  memories: summary.memoryCount,
  averageMemories: summary.memoriesPerAccount.mean,
  consumerShare: summary.segmentShares.consumer,
  severeShare: summary.stageShares.severe,
  disputeRate: summary.disputeRate,
  hardshipRate: summary.hardshipRate,
  doNotContactRate: summary.doNotContactRate,
  phoneConsentRate: summary.phoneConsentRate,
  reachedRate: summary.reachedRate,
  daysPastDueToRisk: summary.correlations.daysPastDueToRisk,
  daysPastDueToContactability:
    summary.correlations.daysPastDueToContactability,
});
console.log(`Reproducible SHA-256: ${digest(portfolio)}`);
