import { createSeededRandom, type SeededRandom } from "./prng";
import { summarizePortfolio } from "./statistics";
import type {
  AccountStatus,
  CollectionMemory,
  CollectionMemoryOutcome,
  CollectionMemoryType,
  ContactabilityBand,
  CustomerSegment,
  DelinquencyStage,
  PreferredChannel,
  PromiseBehavior,
  RiskTier,
  SyntheticAccount,
  SyntheticPortfolio,
} from "./types";

export const DEFAULT_PORTFOLIO_SEED = 0x53484152;
export const DEFAULT_PORTFOLIO_SIZE = 2_400;
export const PORTFOLIO_AS_OF = "2026-08-19T12:00:00.000Z";

const DAY_MS = 86_400_000;
const AS_OF_MS = Date.parse(PORTFOLIO_AS_OF);

const PERSON_FIRST = [
  "Ari",
  "Drew",
  "Emery",
  "Jules",
  "Kai",
  "Lane",
  "Micah",
  "Noel",
  "Quinn",
  "Remy",
  "Riley",
  "Sage",
] as const;
const PERSON_LAST = [
  "Arden",
  "Bellin",
  "Corwin",
  "Dalen",
  "Elson",
  "Farren",
  "Graylen",
  "Hollin",
  "Iver",
  "Jorin",
  "Kestin",
  "Larken",
] as const;
const BUSINESS_PREFIX = [
  "Amber",
  "Blue",
  "Cedar",
  "Cobalt",
  "Evergreen",
  "Harbor",
  "Juniper",
  "Northstar",
  "Silver",
  "Summit",
] as const;
const BUSINESS_NOUN = [
  "Canvas",
  "Courier",
  "Craft",
  "Garden",
  "Market",
  "Repair",
  "Studio",
  "Supply",
  "Works",
  "Workshop",
] as const;
const BUSINESS_SUFFIX = ["Co.", "LLC", "Services", "Group"] as const;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const logistic = (value: number) => 1 / (1 + Math.exp(-value));
const dollarsToCents = (value: number) => Math.round(value * 100);
const asIso = (milliseconds: number) => new Date(milliseconds).toISOString();
const daysAgo = (days: number) => asIso(AS_OF_MS - days * DAY_MS);

function randomItem<T>(random: SeededRandom, values: readonly T[]): T {
  return values[random.int(0, values.length - 1)];
}

function delinquencyStage(
  random: SeededRandom,
  segment: CustomerSegment,
): DelinquencyStage {
  return random.weighted(
    segment === "consumer"
      ? [
          ["early", 0.3],
          ["mid", 0.25],
          ["late", 0.2],
          ["severe", 0.25],
        ]
      : [
          ["early", 0.18],
          ["mid", 0.2],
          ["late", 0.21],
          ["severe", 0.41],
        ],
  );
}

function daysForStage(
  random: SeededRandom,
  stage: DelinquencyStage,
): number {
  if (stage === "early") return random.int(5, 29);
  if (stage === "mid") return random.int(30, 59);
  if (stage === "late") return random.int(60, 89);
  return Math.round(90 + Math.pow(random.next(), 0.72) * 180);
}

function riskTier(score: number): RiskTier {
  if (score < 32) return "low";
  if (score < 56) return "medium";
  if (score < 76) return "high";
  return "critical";
}

function contactabilityBand(score: number): ContactabilityBand {
  if (score < 40) return "low";
  if (score < 70) return "medium";
  return "high";
}

function displayName(
  random: SeededRandom,
  segment: CustomerSegment,
  ordinal: number,
): string {
  if (segment === "consumer") {
    return `${randomItem(random, PERSON_FIRST)} ${randomItem(random, PERSON_LAST)} · Demo ${ordinal.toString().padStart(4, "0")}`;
  }
  return `${randomItem(random, BUSINESS_PREFIX)} ${randomItem(random, BUSINESS_NOUN)} ${randomItem(random, BUSINESS_SUFFIX)} · Demo`;
}

function sampleAttemptOutcomes(
  random: SeededRandom,
  attempts: number,
  successfulContacts: number,
  wrongNumberProbability: number,
): CollectionMemoryOutcome[] {
  const outcomes: CollectionMemoryOutcome[] = Array.from(
    { length: successfulContacts },
    () => "reached",
  );
  for (let index = successfulContacts; index < attempts; index += 1) {
    outcomes.push(
      random.weighted([
        ["no_answer", 0.53],
        ["voicemail", 0.4],
        ["wrong_number", wrongNumberProbability],
      ]),
    );
  }
  for (let index = outcomes.length - 1; index > 0; index -= 1) {
    const swapIndex = random.int(0, index);
    [outcomes[index], outcomes[swapIndex]] = [outcomes[swapIndex], outcomes[index]];
  }
  return outcomes;
}

function binomial(
  random: SeededRandom,
  trials: number,
  probability: number,
): number {
  let successes = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    if (random.bool(probability)) successes += 1;
  }
  return successes;
}

function generateOneAccount(
  random: SeededRandom,
  ordinal: number,
): { account: SyntheticAccount; memories: CollectionMemory[] } {
  const id = `acct_${ordinal.toString().padStart(6, "0")}`;
  const segment: CustomerSegment = random.bool(0.82)
    ? "consumer"
    : "small_business";
  const stage = delinquencyStage(random, segment);
  const daysPastDue = daysForStage(random, stage);
  const engagementLatent = random.normal();
  const fragilityLatent = random.normal();
  const documentationLatent = random.normal();
  const stageBalanceMultiplier = {
    early: 0.82,
    mid: 1,
    late: 1.18,
    severe: 1.42,
  }[stage];
  const medianBalance = segment === "consumer" ? 880 : 5_700;
  const balanceDollars = clamp(
    random.logNormal(Math.log(medianBalance * stageBalanceMultiplier), 0.82),
    segment === "consumer" ? 65 : 300,
    segment === "consumer" ? 20_000 : 80_000,
  );
  const originalBalanceCents = dollarsToCents(balanceDollars);

  const hardshipProbability = logistic(
    -2.45 +
      daysPastDue / 185 +
      (segment === "consumer" ? 0.22 : -0.08) +
      fragilityLatent * 0.48,
  );
  const hardshipReported = random.bool(hardshipProbability);
  const disputeProbability = logistic(
    -3.15 +
      (segment === "small_business" ? 0.42 : 0) +
      Math.log1p(balanceDollars) / 24 +
      documentationLatent * 0.42,
  );
  const disputeOpen = random.bool(disputeProbability);
  const doNotContactProbability = logistic(
    -3.75 +
      daysPastDue / 260 -
      engagementLatent * 0.48 +
      (disputeOpen ? 0.35 : 0),
  );
  const doNotContact = random.bool(doNotContactProbability);
  const contactabilityProbability = clamp(
    logistic(
      0.95 +
        engagementLatent * 0.72 -
        daysPastDue / 175 -
        (doNotContact ? 2.2 : 0) -
        (disputeOpen ? 0.16 : 0),
    ),
    0.03,
    0.96,
  );
  const contactabilityScore = Math.round(contactabilityProbability * 100);
  const phoneConsent =
    !doNotContact &&
    random.bool(
      clamp(
        0.9 - daysPastDue / 850 + engagementLatent * 0.035,
        0.52,
        0.94,
      ),
    );
  const preferredChannel = random.weighted<PreferredChannel>([
    ["phone", phoneConsent ? 0.5 : 0.04],
    ["sms", phoneConsent ? 0.3 : 0.24],
    ["email", phoneConsent ? 0.2 : 0.72],
  ]);

  const attempts = clamp(
    1 + random.poisson(0.85 + daysPastDue / 50),
    1,
    12,
  );
  const successfulContacts = binomial(
    random,
    attempts,
    contactabilityProbability * (phoneConsent ? 0.72 : 0.38),
  );
  const hasPromise =
    successfulContacts > 0 &&
    random.bool(
      clamp(
        0.18 + successfulContacts * 0.16 + engagementLatent * 0.06,
        0.08,
        0.76,
      ),
    );
  let promiseBehavior: PromiseBehavior = "none";
  if (hasPromise) {
    const brokenProbability = logistic(
      -1.1 +
        daysPastDue / 155 +
        (hardshipReported ? 0.45 : 0) -
        engagementLatent * 0.42,
    );
    promiseBehavior = random.weighted<PromiseBehavior>([
      ["broken", brokenProbability],
      ["kept", (1 - brokenProbability) * 0.58],
      ["active", (1 - brokenProbability) * 0.42],
    ]);
  }

  const riskScore = Math.round(
    clamp(
      9 +
        daysPastDue * 0.235 +
        Math.log1p(balanceDollars) * 2.15 -
        contactabilityScore * 0.2 +
        (hardshipReported ? 10 : 0) +
        (disputeOpen ? 8 : 0) +
        (promiseBehavior === "broken" ? 14 : 0) +
        (promiseBehavior === "kept" ? -9 : 0) +
        random.normal(0, 5.5),
      3,
      98,
    ),
  );

  let status: AccountStatus;
  if (doNotContact) status = "do_not_contact";
  else if (disputeOpen) status = "disputed";
  else if (promiseBehavior === "kept" && random.bool(0.34)) status = "resolved";
  else if (hardshipReported && successfulContacts > 0 && random.bool(0.64))
    status = "hardship_plan";
  else if (promiseBehavior === "active") status = "promise_to_pay";
  else if (attempts === 1 && daysPastDue < 40) status = "new";
  else status = "active";

  let amountRecoveredCents = 0;
  if (promiseBehavior === "kept") {
    amountRecoveredCents = Math.round(
      originalBalanceCents * (0.1 + random.next() * 0.48),
    );
  }
  if (status === "resolved") amountRecoveredCents = originalBalanceCents;
  const balanceCents = Math.max(0, originalBalanceCents - amountRecoveredCents);
  const openedDaysAgo = daysPastDue + random.int(18, 100);
  const openedAt = daysAgo(openedDaysAgo);
  const nextActionAt =
    status === "resolved" || status === "do_not_contact"
      ? undefined
      : asIso(AS_OF_MS + random.int(1, status === "disputed" ? 14 : 7) * DAY_MS);

  const account: SyntheticAccount = {
    id,
    tenantId: "demo-portfolio",
    synthetic: true,
    displayName: displayName(random, segment, ordinal),
    segment,
    // +1 000 is deliberately invalid under NANP, preventing accidental calls.
    phoneNumber: `+1000${ordinal.toString().padStart(7, "0")}`,
    email: `demo+${id}@invalid.example`,
    preferredChannel,
    phoneConsent,
    balanceCents,
    originalBalanceCents,
    currency: "USD",
    daysPastDue,
    delinquencyStage: stage,
    contactabilityScore,
    contactabilityBand: contactabilityBand(contactabilityScore),
    riskScore,
    riskTier: riskTier(riskScore),
    disputeOpen,
    hardshipReported,
    doNotContact,
    promiseBehavior,
    status,
    attempts,
    successfulContacts,
    amountRecoveredCents,
    openedAt,
    nextActionAt,
  };

  const memories: CollectionMemory[] = [];
  const addMemory = (
    type: CollectionMemoryType,
    outcome: CollectionMemoryOutcome,
    channel: CollectionMemory["channel"],
    summary: string,
    daysBeforeAsOf: number,
    durable = false,
    amountCents?: number,
  ) => {
    memories.push({
      id: `${id}_mem_${(memories.length + 1).toString().padStart(2, "0")}`,
      tenantId: "demo-portfolio",
      synthetic: true,
      accountId: id,
      type,
      outcome,
      channel,
      summary,
      occurredAt: daysAgo(clamp(daysBeforeAsOf, 0, openedDaysAgo)),
      durable,
      amountCents,
    });
  };

  addMemory(
    "account_opened",
    "recorded",
    "system",
    `Synthetic ${segment.replace("_", " ")} account entered collections at ${daysPastDue} days past due.`,
    openedDaysAgo,
    true,
  );
  const noticeCount = 1 + random.poisson(stage === "severe" ? 1.1 : 0.45);
  for (let notice = 0; notice < noticeCount; notice += 1) {
    addMemory(
      "notice_sent",
      "delivered",
      random.bool(0.68) ? "email" : "sms",
      "Automated balance notice delivered with account-specific repayment options.",
      random.int(1, Math.max(2, openedDaysAgo - 2)),
    );
  }

  const attemptOutcomes = sampleAttemptOutcomes(
    random,
    attempts,
    successfulContacts,
    0.02 + (1 - contactabilityProbability) * 0.06,
  );
  for (const outcome of attemptOutcomes) {
    const attemptDay = random.int(0, Math.max(1, Math.min(openedDaysAgo - 1, daysPastDue + 12)));
    const channel: PreferredChannel = random.weighted([
      [preferredChannel, 0.62],
      ["phone", 0.2],
      ["sms", 0.1],
      ["email", 0.08],
    ]);
    addMemory(
      "call_attempt",
      outcome,
      channel,
      outcome === "reached"
        ? "Account holder reached; identity-safe balance discussion completed."
        : outcome === "voicemail"
          ? "Consent-safe voicemail left without disclosing debt details."
          : outcome === "wrong_number"
            ? "Synthetic contact route marked unverified after a wrong-number outcome."
            : "Contact attempt completed with no answer.",
      attemptDay,
    );
    if (outcome === "reached") {
      addMemory(
        "contact",
        "reached",
        channel,
        "Account holder discussed the balance, timing, and available next steps.",
        Math.max(0, attemptDay - random.next() / 24),
      );
    }
  }

  if (random.bool(0.28 + successfulContacts * 0.08)) {
    addMemory(
      "contact_preference",
      "recorded",
      "system",
      `Preferred contact channel recorded as ${preferredChannel}.`,
      random.int(0, Math.max(1, Math.min(openedDaysAgo - 1, daysPastDue))),
      true,
    );
  }
  if (hardshipReported) {
    addMemory(
      "hardship_reported",
      "recorded",
      preferredChannel,
      "Temporary financial hardship reported; gentler repayment options are required.",
      random.int(1, Math.max(2, Math.min(openedDaysAgo - 1, daysPastDue + 8))),
      true,
    );
  }
  if (disputeOpen) {
    addMemory(
      "dispute_opened",
      "recorded",
      preferredChannel,
      "Balance validation dispute opened; collection outreach paused for review.",
      random.int(0, Math.max(1, Math.min(openedDaysAgo - 1, daysPastDue))),
      true,
    );
  }
  if (doNotContact) {
    addMemory(
      "do_not_contact",
      "recorded",
      preferredChannel,
      "Do-not-contact request recorded; automated outreach is blocked.",
      random.int(0, Math.max(1, Math.min(openedDaysAgo - 1, daysPastDue))),
      true,
    );
  }
  if (promiseBehavior !== "none") {
    const promiseAmountCents = Math.min(
      originalBalanceCents,
      Math.round(originalBalanceCents * (0.08 + random.next() * 0.34)),
    );
    const promiseDay = random.int(2, Math.max(3, Math.min(openedDaysAgo - 1, 30)));
    addMemory(
      "promise_made",
      "scheduled",
      preferredChannel,
      "A repayment amount and date were confirmed with the account holder.",
      promiseDay,
      true,
      promiseAmountCents,
    );
    if (promiseBehavior === "broken") {
      addMemory(
        "promise_broken",
        "broken",
        "system",
        "Scheduled repayment date passed without the agreed payment.",
        Math.max(0, promiseDay - random.int(1, 2)),
        true,
        promiseAmountCents,
      );
    } else if (promiseBehavior === "kept") {
      addMemory(
        "promise_kept",
        status === "resolved" ? "paid" : "partial_payment",
        "system",
        "Scheduled repayment was received and the outstanding balance was updated.",
        Math.max(0, promiseDay - random.int(1, 2)),
        true,
        amountRecoveredCents,
      );
      addMemory(
        "payment_received",
        status === "resolved" ? "paid" : "partial_payment",
        "system",
        status === "resolved"
          ? "Final payment received; synthetic account resolved."
          : "Partial payment applied to the synthetic account.",
        Math.max(0, promiseDay - random.int(1, 2)),
        true,
        amountRecoveredCents,
      );
    }
  }

  memories.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  memories.forEach((memory, index) => {
    memory.id = `${id}_mem_${(index + 1).toString().padStart(2, "0")}`;
  });
  const lastContact = [...memories]
    .reverse()
    .find(
      (memory) =>
        memory.type === "contact" ||
        (memory.type === "call_attempt" && memory.outcome === "reached"),
    );
  if (lastContact) account.lastContactAt = lastContact.occurredAt;

  return { account, memories };
}

export interface GeneratePortfolioOptions {
  size?: number;
  seed?: number;
}

export function generateSyntheticPortfolio(
  options: GeneratePortfolioOptions = {},
): SyntheticPortfolio {
  const size = options.size ?? DEFAULT_PORTFOLIO_SIZE;
  const seed = options.seed ?? DEFAULT_PORTFOLIO_SEED;
  if (!Number.isSafeInteger(size) || size < 1 || size > 9_999_999) {
    throw new RangeError("portfolio size must be an integer between 1 and 9,999,999");
  }
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError("portfolio seed must be a safe integer");
  }

  const random = createSeededRandom(seed);
  const accounts: SyntheticAccount[] = [];
  const memories: CollectionMemory[] = [];
  for (let ordinal = 1; ordinal <= size; ordinal += 1) {
    const generated = generateOneAccount(random, ordinal);
    accounts.push(generated.account);
    memories.push(...generated.memories);
  }

  return {
    seed,
    asOf: PORTFOLIO_AS_OF,
    accounts,
    memories,
    summary: summarizePortfolio(accounts, memories, PORTFOLIO_AS_OF),
  };
}
