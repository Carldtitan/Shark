import type {
  AccountStatus,
  CollectionMemory,
  CollectionMemoryType,
  CustomerSegment,
  DelinquencyStage,
  NumericDistribution,
  PortfolioSummary,
  PromiseBehavior,
  RiskTier,
  SyntheticAccount,
} from "./types";

const SEGMENTS: CustomerSegment[] = ["consumer", "small_business"];
const STAGES: DelinquencyStage[] = ["early", "mid", "late", "severe"];
const RISKS: RiskTier[] = ["low", "medium", "high", "critical"];
const STATUSES: AccountStatus[] = [
  "new",
  "active",
  "promise_to_pay",
  "hardship_plan",
  "disputed",
  "do_not_contact",
  "resolved",
];
const PROMISES: PromiseBehavior[] = ["none", "active", "kept", "broken"];
const MEMORY_TYPES: CollectionMemoryType[] = [
  "account_opened",
  "notice_sent",
  "call_attempt",
  "contact",
  "promise_made",
  "promise_kept",
  "promise_broken",
  "hardship_reported",
  "dispute_opened",
  "contact_preference",
  "do_not_contact",
  "payment_received",
];

function countBy<T extends string>(
  values: readonly T[],
  expected: readonly T[],
): Record<T, number> {
  const result = Object.fromEntries(expected.map((key) => [key, 0])) as Record<
    T,
    number
  >;
  for (const value of values) result[value] += 1;
  return result;
}

function shares<T extends string>(
  counts: Record<T, number>,
  total: number,
): Record<T, number> {
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [
      key,
      total === 0 ? 0 : Number((Number(value) / total).toFixed(4)),
    ]),
  ) as Record<T, number>;
}

function quantile(sortedValues: readonly number[], probability: number): number {
  if (sortedValues.length === 0) return 0;
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const remainder = position - lower;
  const upper = sortedValues[lower + 1];
  return upper === undefined
    ? sortedValues[lower]
    : sortedValues[lower] + remainder * (upper - sortedValues[lower]);
}

export function numericDistribution(
  values: readonly number[],
): NumericDistribution {
  if (values.length === 0) {
    return { min: 0, mean: 0, p50: 0, p90: 0, max: 0 };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    min: sorted[0],
    mean: Number(mean.toFixed(2)),
    p50: Number(quantile(sorted, 0.5).toFixed(2)),
    p90: Number(quantile(sorted, 0.9).toFixed(2)),
    max: sorted[sorted.length - 1],
  };
}

export function pearsonCorrelation(
  first: readonly number[],
  second: readonly number[],
): number {
  if (first.length !== second.length || first.length < 2) return 0;
  const firstMean = first.reduce((sum, value) => sum + value, 0) / first.length;
  const secondMean = second.reduce((sum, value) => sum + value, 0) / second.length;
  let numerator = 0;
  let firstVariance = 0;
  let secondVariance = 0;
  for (let index = 0; index < first.length; index += 1) {
    const firstDelta = first[index] - firstMean;
    const secondDelta = second[index] - secondMean;
    numerator += firstDelta * secondDelta;
    firstVariance += firstDelta ** 2;
    secondVariance += secondDelta ** 2;
  }
  if (firstVariance === 0 || secondVariance === 0) return 0;
  return Number(
    (numerator / Math.sqrt(firstVariance * secondVariance)).toFixed(4),
  );
}

export function summarizePortfolio(
  accounts: readonly SyntheticAccount[],
  memories: readonly CollectionMemory[],
  generatedAt: string,
): PortfolioSummary {
  const accountCount = accounts.length;
  const memoryCounts = new Map<string, number>();
  for (const memory of memories) {
    memoryCounts.set(memory.accountId, (memoryCounts.get(memory.accountId) ?? 0) + 1);
  }

  const segmentCounts = countBy(
    accounts.map((account) => account.segment),
    SEGMENTS,
  );
  const stageCounts = countBy(
    accounts.map((account) => account.delinquencyStage),
    STAGES,
  );
  const riskCounts = countBy(
    accounts.map((account) => account.riskTier),
    RISKS,
  );
  const statusCounts = countBy(
    accounts.map((account) => account.status),
    STATUSES,
  );
  const promiseCounts = countBy(
    accounts.map((account) => account.promiseBehavior),
    PROMISES,
  );
  const memoryTypeCounts = countBy(
    memories.map((memory) => memory.type),
    MEMORY_TYPES,
  );

  const average = (values: readonly number[]) =>
    values.length === 0
      ? 0
      : Number(
          (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(
            2,
          ),
        );
  const rate = (predicate: (account: SyntheticAccount) => boolean) =>
    accountCount === 0
      ? 0
      : Number((accounts.filter(predicate).length / accountCount).toFixed(4));
  const callAttempts = memories.filter((memory) => memory.type === "call_attempt");
  const reached = callAttempts.filter((memory) => memory.outcome === "reached");

  return {
    generatedAt,
    accountCount,
    memoryCount: memories.length,
    totalOutstandingCents: accounts.reduce(
      (sum, account) => sum + account.balanceCents,
      0,
    ),
    totalRecoveredCents: accounts.reduce(
      (sum, account) => sum + account.amountRecoveredCents,
      0,
    ),
    balances: numericDistribution(accounts.map((account) => account.balanceCents)),
    daysPastDue: numericDistribution(accounts.map((account) => account.daysPastDue)),
    memoriesPerAccount: numericDistribution(
      accounts.map((account) => memoryCounts.get(account.id) ?? 0),
    ),
    averageContactabilityScore: average(
      accounts.map((account) => account.contactabilityScore),
    ),
    averageRiskScore: average(accounts.map((account) => account.riskScore)),
    segmentCounts,
    segmentShares: shares(segmentCounts, accountCount),
    stageCounts,
    stageShares: shares(stageCounts, accountCount),
    riskCounts,
    riskShares: shares(riskCounts, accountCount),
    statusCounts,
    statusShares: shares(statusCounts, accountCount),
    promiseCounts,
    promiseShares: shares(promiseCounts, accountCount),
    memoryTypeCounts,
    disputeRate: rate((account) => account.disputeOpen),
    hardshipRate: rate((account) => account.hardshipReported),
    doNotContactRate: rate((account) => account.doNotContact),
    phoneConsentRate: rate((account) => account.phoneConsent),
    reachedRate:
      callAttempts.length === 0
        ? 0
        : Number((reached.length / callAttempts.length).toFixed(4)),
    correlations: {
      daysPastDueToRisk: pearsonCorrelation(
        accounts.map((account) => account.daysPastDue),
        accounts.map((account) => account.riskScore),
      ),
      daysPastDueToContactability: pearsonCorrelation(
        accounts.map((account) => account.daysPastDue),
        accounts.map((account) => account.contactabilityScore),
      ),
      balanceToRisk: pearsonCorrelation(
        accounts.map((account) => account.balanceCents),
        accounts.map((account) => account.riskScore),
      ),
    },
  };
}
