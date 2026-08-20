import "server-only";

import {
  generateSyntheticPortfolio,
  type CollectionMemory,
  type SyntheticAccount,
} from "@/lib/collections";

export type UiStatus =
  | "needs_contact"
  | "promise_due"
  | "monitoring"
  | "escalated"
  | "blocked"
  | "resolved";

const states = ["CA", "TX", "FL", "NY", "IL", "GA", "WA", "AZ", "NC", "CO"];

const portfolio = generateSyntheticPortfolio();
const memoriesByAccount = new Map<string, CollectionMemory[]>();

for (const memory of portfolio.memories) {
  const group = memoriesByAccount.get(memory.accountId) ?? [];
  group.push(memory);
  memoriesByAccount.set(memory.accountId, group);
}

function uiStatus(account: SyntheticAccount): UiStatus {
  if (account.doNotContact || account.disputeOpen) return "blocked";
  if (account.status === "resolved") return "resolved";
  if (account.status === "promise_to_pay") return "promise_due";
  if (account.status === "hardship_plan") return "monitoring";
  if (account.riskTier === "critical" && account.daysPastDue > 150) return "escalated";
  return "needs_contact";
}

function nextAction(account: SyntheticAccount) {
  if (account.doNotContact) return "Escalate do-not-contact record";
  if (account.disputeOpen) return "Route dispute for balance validation";
  if (account.status === "resolved") return "Close account and retain audit trail";
  if (account.promiseBehavior === "active") return "Monitor the active payment promise";
  if (account.promiseBehavior === "broken") return "Call to revisit the broken promise";
  if (account.hardshipReported) return "Offer the approved hardship plan";
  if (account.preferredChannel === "phone") return "Call during the preferred contact window";
  return `Start with ${account.preferredChannel}, then call if unanswered`;
}

export function getSyntheticAccount(id: string) {
  return portfolio.accounts.find((account) => account.id === id);
}

export function getPortfolio() {
  return portfolio;
}

export function toDashboardAccount(account: SyntheticAccount) {
  const ordinal = Number(account.id.slice(-6));
  const memories = [...(memoriesByAccount.get(account.id) ?? [])]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 8)
    .map((memory) => ({
      id: memory.id,
      type: memory.type.replaceAll("_", " "),
      summary: memory.summary,
      eventAt: memory.occurredAt,
      channel: memory.channel,
      durable: memory.durable,
      outcome: memory.outcome,
    }));
  const balance = account.balanceCents / 100;
  const status = uiStatus(account);

  return {
    id: account.id,
    name: account.displayName,
    balance,
    daysPastDue: account.daysPastDue,
    status,
    riskBand: account.riskTier,
    propensityToPay: Math.max(
      0.04,
      Math.min(
        0.94,
        account.contactabilityScore / 100 - account.riskScore / 280 + 0.26,
      ),
    ),
    state: states[ordinal % states.length],
    segment: account.segment,
    nextAction: nextAction(account),
    blockedReason: account.doNotContact
      ? "do-not-contact request is active"
      : account.disputeOpen
        ? "balance dispute requires review"
        : undefined,
    memories,
    allowedOffer: {
      minimumPayment: Math.max(25, Math.round(balance * (account.hardshipReported ? 0.05 : 0.12))),
      maxInstallments: account.hardshipReported ? 6 : account.riskTier === "critical" ? 3 : 4,
      maxDiscountPercent: account.hardshipReported ? 20 : 12,
    },
  };
}

export function dashboardPayload() {
  const accounts = portfolio.accounts.map(toDashboardAccount);
  const statuses: Record<UiStatus, number> = {
    needs_contact: 0,
    promise_due: 0,
    monitoring: 0,
    escalated: 0,
    blocked: 0,
    resolved: 0,
  };
  for (const account of accounts) statuses[account.status] += 1;
  const contacted = portfolio.accounts.filter((account) => account.successfulContacts > 0);
  const promises = contacted.filter((account) => account.promiseBehavior !== "none");

  return {
    source: "synthetic" as const,
    generatedAt: portfolio.asOf,
    methodology:
      "Seed 0x53484152 · correlated probability distributions · no handpicked records",
    summary: {
      accountCount: portfolio.summary.accountCount,
      totalBalance: portfolio.summary.totalOutstandingCents / 100,
      averageDaysPastDue: portfolio.summary.daysPastDue.mean,
      contactRate: portfolio.summary.reachedRate,
      promiseRate: contacted.length ? promises.length / contacted.length : 0,
      statuses,
    },
    // The first records are themselves a seeded random draw; no showcase rows are selected.
    accounts: accounts.slice(0, 180),
  };
}
