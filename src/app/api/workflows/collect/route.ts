import { getSyntheticAccount } from "@/server/portfolio";
import { runCollectionsWorkflow } from "@/server/mastra/collections-workflow";
import { startVapiCall, verifyDemoPin } from "@/server/vapi";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  accountId: z.string().min(1),
  mode: z.enum(["simulate", "live"]),
  pin: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid workflow request." }, { status: 400 });
    }

    const account = getSyntheticAccount(parsed.data.accountId);
    if (!account) {
      return Response.json({ error: "Account not found." }, { status: 404 });
    }

    const decision = await runCollectionsWorkflow(account.id);
    const baseSteps = [
      { id: "lookup", label: "Account lookup", detail: "Loaded authoritative current state", status: "complete" as const },
      { id: "recall", label: "Memory recall", detail: `${decision.memoryCount} relevant events assembled`, status: "complete" as const },
      {
        id: "policy",
        label: "Policy gate",
        detail: decision.allowed ? "Contact and offer bounds passed" : decision.blockedReason || "Blocked",
        status: decision.allowed ? ("complete" as const) : ("blocked" as const),
      },
    ];

    if (!decision.allowed) {
      return Response.json(
        { error: decision.summary, ...decision, mode: parsed.data.mode, steps: baseSteps },
        { status: 409 },
      );
    }

    let callId: string | undefined;
    if (parsed.data.mode === "live") {
      if (!parsed.data.pin || !verifyDemoPin(parsed.data.pin)) {
        return Response.json({ error: "The demo call PIN is incorrect." }, { status: 403 });
      }
      if (!account.phoneConsent) {
        return Response.json({ error: "This sampled account is not phone-consented." }, { status: 409 });
      }
      const call = await startVapiCall({
        accountId: account.id,
        accountName: account.displayName,
        balance: account.balanceCents / 100,
        daysPastDue: account.daysPastDue,
        minimumPayment: decision.minimumPayment,
        maxInstallments: decision.maxInstallments,
        maxDiscountPercent: decision.maxDiscountPercent,
      });
      callId = call.id;
    }

    const now = new Date().toISOString();
    const memory = {
      id: `${account.id}_${parsed.data.mode}_${Date.now()}`,
      type: parsed.data.mode === "live" ? "outbound call" : "simulated outcome",
      summary:
        parsed.data.mode === "live"
          ? "A consented Vapi call was started with the bounded account brief."
          : decision.summary,
      eventAt: now,
      channel: parsed.data.mode === "live" ? "phone" : "simulation",
      durable: false,
      outcome: decision.disposition,
    };

    return Response.json({
      mode: parsed.data.mode,
      disposition:
        parsed.data.mode === "live" ? "Outbound call queued" : decision.disposition,
      summary:
        parsed.data.mode === "live"
          ? "Vapi accepted the call. The configured assistant received only the synthetic account brief and hard offer limits."
          : decision.summary,
      nextAction: decision.nextAction,
      callId,
      memory,
      steps: [
        ...baseSteps,
        {
          id: "action",
          label: parsed.data.mode === "live" ? "Vapi call" : "Outcome simulation",
          detail: parsed.data.mode === "live" ? "Call accepted by Vapi" : decision.disposition,
          status: "complete" as const,
        },
        { id: "persist", label: "Memory update", detail: "Outcome prepared for Elasticsearch", status: "complete" as const },
      ],
    });
  } catch (cause) {
    return Response.json(
      { error: cause instanceof Error ? cause.message : "Workflow failed." },
      { status: 500 },
    );
  }
}
