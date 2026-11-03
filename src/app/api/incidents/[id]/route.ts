import { NextResponse } from "next/server";
import { getIncident } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "Invalid incident ID" }, { status: 400 });
  const record = await getIncident(id);
  if (!record) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  return NextResponse.json(record, { headers: { "Cache-Control": "no-store" } });
}
