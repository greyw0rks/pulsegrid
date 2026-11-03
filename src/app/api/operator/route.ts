import { authorizeOperator } from "@/lib/configuration";
import { runtimeConfig } from "@/lib/env";

export async function GET(request: Request) {
  if (!authorizeOperator(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ authenticated: true, allowedHosts: runtimeConfig().allowedHosts }, { headers: { "Cache-Control": "no-store" } });
}
