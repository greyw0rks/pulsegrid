import { authorizeOperator, setEndpointEnabled } from "@/lib/configuration";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorizeOperator(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return Response.json({ error: "enabled must be a boolean" }, { status: 400 });
  const updated = await setEndpointEnabled(id, body.enabled).catch(() => false);
  return updated ? Response.json({ id, enabled: body.enabled }) : Response.json({ error: "Endpoint not found" }, { status: 404 });
}
