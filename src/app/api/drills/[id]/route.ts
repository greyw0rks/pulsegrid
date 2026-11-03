import { authorizeOperator, setDrillFault } from "@/lib/configuration";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorizeOperator(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as { faultMode?: unknown } | null;
  if (body?.faultMode !== "normal" && body?.faultMode !== "timeout") return Response.json({ error: "faultMode must be normal or timeout" }, { status: 400 });
  try {
    const updated = await setDrillFault(id, body.faultMode);
    return updated ? Response.json({ id, faultMode: body.faultMode }) : Response.json({ error: "Drill endpoint not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Drill could not be changed" }, { status: 400 });
  }
}
