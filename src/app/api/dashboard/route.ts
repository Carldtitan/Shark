import { dashboardPayload } from "@/server/portfolio";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(dashboardPayload(), {
    headers: { "cache-control": "no-store" },
  });
}
