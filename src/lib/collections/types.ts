export type CustomerSegment = "consumer" | "small_business";

export type DelinquencyStage =
  | "early"
  | "mid"
  | "late"
  | "severe";

export type RiskTier = "low" | "medium" | "high" | "critical";

export type AccountStatus =
  | "new"
  | "active"
  | "promise_to_pay"
  | "hardship_plan"
  | "disputed"
  | "do_not_contact"
  | "resolved";

export type ContactabilityBand = "low" | "medium" | "high";

export type PreferredChannel = "phone" | "sms" | "email";

export type PromiseBehavior =
  | "none"
  | "active"
  | "kept"
  | "broken";

export type CollectionMemoryType =
  | "account_opened"
  | "notice_sent"
  | "call_attempt"
  | "contact"
  | "promise_made"
  | "promise_kept"
  | "promise_broken"
  | "hardship_reported"
  | "dispute_opened"
  | "contact_preference"
  | "do_not_contact"
  | "payment_received";

export type CollectionMemoryOutcome =
  | "recorded"
  | "delivered"
  | "reached"
  | "no_answer"
  | "voicemail"
  | "wrong_number"
  | "scheduled"
  | "kept"
  | "broken"
  | "partial_payment"
  | "paid";

export interface SyntheticAccount {
  id: string;
  tenantId: "demo-portfolio";
  synthetic: true;
  displayName: string;
  segment: CustomerSegment;
  phoneNumber: string;
  email: string;
  preferredChannel: PreferredChannel;
  phoneConsent: boolean;
  balanceCents: number;
  originalBalanceCents: number;
  currency: "USD";
  daysPastDue: number;
  delinquencyStage: DelinquencyStage;
  contactabilityScore: number;
  contactabilityBand: ContactabilityBand;
  riskScore: number;
  riskTier: RiskTier;
  disputeOpen: boolean;
  hardshipReported: boolean;
  doNotContact: boolean;
  promiseBehavior: PromiseBehavior;
  status: AccountStatus;
  attempts: number;
  successfulContacts: number;
  amountRecoveredCents: number;
  openedAt: string;
  lastContactAt?: string;
  nextActionAt?: string;
}

export interface CollectionMemory {
  id: string;
  tenantId: "demo-portfolio";
  synthetic: true;
  accountId: string;
  type: CollectionMemoryType;
  outcome: CollectionMemoryOutcome;
  channel: PreferredChannel | "system";
  summary: string;
  occurredAt: string;
  durable: boolean;
  amountCents?: number;
}

export interface SyntheticPortfolio {
  seed: number;
  asOf: string;
  accounts: SyntheticAccount[];
  memories: CollectionMemory[];
  summary: PortfolioSummary;
}

export interface NumericDistribution {
  min: number;
  mean: number;
  p50: number;
  p90: number;
  max: number;
}

export interface PortfolioSummary {
  generatedAt: string;
  accountCount: number;
  memoryCount: number;
  totalOutstandingCents: number;
  totalRecoveredCents: number;
  balances: NumericDistribution;
  daysPastDue: NumericDistribution;
  memoriesPerAccount: NumericDistribution;
  averageContactabilityScore: number;
  averageRiskScore: number;
  segmentCounts: Record<CustomerSegment, number>;
  segmentShares: Record<CustomerSegment, number>;
  stageCounts: Record<DelinquencyStage, number>;
  stageShares: Record<DelinquencyStage, number>;
  riskCounts: Record<RiskTier, number>;
  riskShares: Record<RiskTier, number>;
  statusCounts: Record<AccountStatus, number>;
  statusShares: Record<AccountStatus, number>;
  promiseCounts: Record<PromiseBehavior, number>;
  promiseShares: Record<PromiseBehavior, number>;
  memoryTypeCounts: Record<CollectionMemoryType, number>;
  disputeRate: number;
  hardshipRate: number;
  doNotContactRate: number;
  phoneConsentRate: number;
  reachedRate: number;
  correlations: {
    daysPastDueToRisk: number;
    daysPastDueToContactability: number;
    balanceToRisk: number;
  };
}
