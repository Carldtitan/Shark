import "server-only";

import { createSeededRandom } from "@/lib/collections";
import { getSyntheticAccount } from "@/server/portfolio";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const workflowInput = z.object({ accountId: z.string().min(1) });

const accountContext = z.object({
  accountId: z.string(),
  name: z.string(),
  balance: z.number(),
  daysPastDue: z.number(),
  riskTier: z.enum(["low", "medium", "high", "critical"]),
  contactability: z.number(),
  phoneConsent: z.boolean(),
  doNotContact: z.boolean(),
  disputeOpen: z.boolean(),
  hardshipReported: z.boolean(),
  promiseBehavior: z.enum(["none", "active", "kept", "broken"]),
  preferredChannel: z.enum(["phone", "sms", "email"]),
  memoryCount: z.number(),
});

const gatedContext = accountContext.extend({
  allowed: z.boolean(),
  blockedReason: z.string().optional(),
  minimumPayment: z.number(),
  maxInstallments: z.number(),
  maxDiscountPercent: z.number(),
});

const decisionOutput = z.object({
  allowed: z.boolean(),
  blockedReason: z.string().optional(),
  disposition: z.string(),
  summary: z.string(),
  nextAction: z.string(),
  minimumPayment: z.number(),
  maxInstallments: z.number(),
  maxDiscountPercent: z.number(),
  memoryCount: z.number(),
});

const loadAccount = createStep({
  id: "load-account-and-memory",
  inputSchema: workflowInput,
  outputSchema: accountContext,
  execute: async ({ inputData }) => {
    const account = getSyntheticAccount(inputData.accountId);
    if (!account) throw new Error("Account not found in the synthetic portfolio.");
    return {
      accountId: account.id,
      name: account.displayName,
      balance: account.balanceCents / 100,
      daysPastDue: account.daysPastDue,
      riskTier: account.riskTier,
      contactability: account.contactabilityScore / 100,
      phoneConsent: account.phoneConsent,
      doNotContact: account.doNotContact,
      disputeOpen: account.disputeOpen,
      hardshipReported: account.hardshipReported,
      promiseBehavior: account.promiseBehavior,
      preferredChannel: account.preferredChannel,
      memoryCount: account.attempts + account.successfulContacts + 2,
    };
  },
});

const enforcePolicy = createStep({
  id: "enforce-deterministic-policy",
  inputSchema: accountContext,
  outputSchema: gatedContext,
  execute: async ({ inputData }) => {
    const balance = inputData.balance;
    const blockedReason = inputData.doNotContact
      ? "do-not-contact request is active"
      : inputData.disputeOpen
        ? "balance dispute requires human review"
        : undefined;
    return {
      ...inputData,
      allowed: !blockedReason,
      blockedReason,
      minimumPayment: Math.max(
        25,
        Math.round(balance * (inputData.hardshipReported ? 0.05 : 0.12)),
      ),
      maxInstallments: inputData.hardshipReported ? 6 : 4,
      maxDiscountPercent: inputData.hardshipReported ? 20 : 12,
    };
  },
});

const decideAction = createStep({
  id: "decide-bounded-next-action",
  inputSchema: gatedContext,
  outputSchema: decisionOutput,
  execute: async ({ inputData }) => {
    if (!inputData.allowed) {
      return {
        allowed: false,
        blockedReason: inputData.blockedReason,
        disposition: "Policy escalation",
        summary: `Automated outreach stopped because ${inputData.blockedReason}.`,
        nextAction: "Assign a human compliance review",
        minimumPayment: inputData.minimumPayment,
        maxInstallments: inputData.maxInstallments,
        maxDiscountPercent: inputData.maxDiscountPercent,
        memoryCount: inputData.memoryCount,
      };
    }

    const numericId = Number(inputData.accountId.slice(-6));
    const random = createSeededRandom(numericId * 31 + inputData.daysPastDue);
    const reached = random.bool(
      Math.max(0.08, Math.min(0.88, inputData.contactability * 0.9)),
    );
    if (!reached) {
      return {
        allowed: true,
        disposition: random.bool(0.58) ? "Voicemail left" : "No answer",
        summary:
          "The contact attempt did not reach the account holder. No protected account details were disclosed.",
        nextAction: `Retry by ${inputData.preferredChannel} in 48 hours`,
        minimumPayment: inputData.minimumPayment,
        maxInstallments: inputData.maxInstallments,
        maxDiscountPercent: inputData.maxDiscountPercent,
        memoryCount: inputData.memoryCount,
      };
    }

    const disposition = inputData.hardshipReported
      ? "Hardship plan accepted"
      : inputData.promiseBehavior === "broken"
        ? "Promise restructured"
        : random.bool(0.64)
          ? "Promise to pay"
          : "Callback scheduled";
    return {
      allowed: true,
      disposition,
      summary:
        disposition === "Callback scheduled"
          ? "Identity was verified and the account holder requested a scheduled follow-up before choosing an option."
          : `Identity was verified and a bounded arrangement was agreed at ${inputData.maxInstallments} payments or fewer.`,
      nextAction:
        disposition === "Callback scheduled"
          ? "Call at the requested time and preserve the same offer bounds"
          : "Monitor the new commitment and follow up before its due date",
      minimumPayment: inputData.minimumPayment,
      maxInstallments: inputData.maxInstallments,
      maxDiscountPercent: inputData.maxDiscountPercent,
      memoryCount: inputData.memoryCount,
    };
  },
});

export const collectionsWorkflow = createWorkflow({
  id: "shark-collections-workflow",
  inputSchema: workflowInput,
  outputSchema: decisionOutput,
})
  .then(loadAccount)
  .then(enforcePolicy)
  .then(decideAction)
  .commit();

export async function runCollectionsWorkflow(accountId: string) {
  const run = await collectionsWorkflow.createRun();
  const result = await run.start({ inputData: { accountId } });
  if (result.status !== "success") {
    throw new Error(
      result.status === "failed" ? result.error.message : "Workflow did not complete.",
    );
  }
  return result.result;
}
