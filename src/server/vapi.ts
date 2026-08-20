import "server-only";

import { timingSafeEqual } from "node:crypto";

type CallBrief = {
  accountId: string;
  accountName: string;
  balance: number;
  daysPastDue: number;
  minimumPayment: number;
  maxInstallments: number;
  maxDiscountPercent: number;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured on the server.`);
  return value;
}

export function verifyDemoPin(candidate: string) {
  const expected = requireEnv("DEMO_CALL_PIN");
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function startVapiCall(brief: CallBrief) {
  const apiKey = requireEnv("VAPI_API_KEY");
  const assistantId = requireEnv("VAPI_ASSISTANT_ID");
  const phoneNumberId = requireEnv("VAPI_PHONE_NUMBER_ID");
  const destination = requireEnv("DEMO_RECIPIENT_PHONE");

  const response = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      assistantId,
      phoneNumberId,
      customer: { number: destination, name: "Consented Shark demo recipient" },
      assistantOverrides: {
        variableValues: {
          accountId: brief.accountId,
          customerName: brief.accountName,
          balance: brief.balance.toFixed(2),
          daysPastDue: brief.daysPastDue,
          minimumPayment: brief.minimumPayment.toFixed(2),
          maxInstallments: brief.maxInstallments,
          maxDiscountPercent: brief.maxDiscountPercent,
          syntheticDataNotice: "This is a synthetic hackathon demonstration.",
        },
      },
      metadata: {
        product: "shark",
        accountId: brief.accountId,
        synthetic: true,
      },
    }),
  });

  const body = (await response.json()) as { id?: string; message?: string };
  if (!response.ok || !body.id) {
    throw new Error(body.message || `Vapi rejected the call (${response.status}).`);
  }
  return { id: body.id };
}
